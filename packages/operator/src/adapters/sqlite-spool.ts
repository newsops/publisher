import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { sqliteFailure } from './sqlite-codec'

export function spoolDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

interface SpoolEnvelope {
  readonly schema: 1
  readonly siteId: string
  readonly operationId: string
  readonly intentDigest: string
  readonly payloadDigest: string
  readonly payload: string
}

function parseEnvelope(text: string): SpoolEnvelope {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw sqliteFailure('CORRUPT', 'corrupt operation spool envelope')
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('schema' in value) ||
    value.schema !== 1 ||
    !('siteId' in value) ||
    typeof value.siteId !== 'string' ||
    !('operationId' in value) ||
    typeof value.operationId !== 'string' ||
    !('intentDigest' in value) ||
    typeof value.intentDigest !== 'string' ||
    !('payloadDigest' in value) ||
    typeof value.payloadDigest !== 'string' ||
    !('payload' in value) ||
    typeof value.payload !== 'string'
  )
    throw sqliteFailure('CORRUPT', 'corrupt operation spool envelope')
  return {
    schema: 1,
    siteId: value.siteId,
    operationId: value.operationId,
    intentDigest: value.intentDigest,
    payloadDigest: value.payloadDigest,
    payload: value.payload,
  }
}

export class SqliteOperationSpool {
  private readonly directory: string
  constructor(
    databasePath: string,
    private readonly siteId: string,
  ) {
    this.directory = `${databasePath}.operations`
  }

  private path(operationId: string): string {
    return join(this.directory, `${spoolDigest(operationId)}.prepared`)
  }

  private assertDirectory(): void {
    const stat = lstatSync(this.directory)
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0
    )
      throw sqliteFailure(
        'CORRUPT',
        'invalid or insecure operation spool directory',
      )
  }

  private flushDirectory(): void {
    for (const path of [this.directory, dirname(this.directory)]) {
      const directory = openSync(path, 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    }
  }

  private readEnvelope(path: string): SpoolEnvelope {
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = fstatSync(descriptor)
      if (!stat.isFile() || (stat.mode & 0o077) !== 0)
        throw sqliteFailure(
          'CORRUPT',
          'invalid or insecure operation spool file',
        )
      return parseEnvelope(readFileSync(descriptor, 'utf8'))
    } finally {
      closeSync(descriptor)
    }
  }

  read(
    operationId: string,
    intent: string,
    expectedDigest?: string,
  ): { payload: string; digest: string } | undefined {
    if (!existsSync(this.directory)) return undefined
    this.assertDirectory()
    const path = this.path(operationId)
    if (!existsSync(path)) return undefined
    if (lstatSync(path).isSymbolicLink())
      throw sqliteFailure('CORRUPT', 'invalid operation spool file')
    const envelope = this.readEnvelope(path)
    if (
      envelope.siteId !== this.siteId ||
      envelope.operationId !== operationId ||
      envelope.intentDigest !== spoolDigest(intent)
    )
      throw sqliteFailure(
        'OPERATION_CONFLICT',
        'operation spool logical intent conflict',
      )
    const digest = spoolDigest(envelope.payload)
    if (
      envelope.payloadDigest !== digest ||
      (expectedDigest !== undefined && digest !== expectedDigest)
    )
      throw sqliteFailure('CORRUPT', 'corrupt operation spool digest')
    this.flushDirectory()
    return { payload: envelope.payload, digest }
  }

  write(operationId: string, intent: string, payload: string): string {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    this.assertDirectory()
    const path = this.path(operationId)
    const expectedDigest = spoolDigest(payload)
    const prior = this.read(operationId, intent)
    if (prior) {
      if (prior.payload !== payload)
        throw sqliteFailure(
          'OPERATION_CONFLICT',
          'operation spool payload conflict',
        )
      return prior.digest
    }
    const envelope: SpoolEnvelope = {
      schema: 1,
      siteId: this.siteId,
      operationId,
      intentDigest: spoolDigest(intent),
      payloadDigest: expectedDigest,
      payload,
    }
    const temporary = `${path}.${randomUUID()}.tmp`
    const descriptor = openSync(temporary, 'wx', 0o600)
    try {
      writeFileSync(descriptor, JSON.stringify(envelope), 'utf8')
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    try {
      linkSync(temporary, path)
    } finally {
      unlinkSync(temporary)
    }
    this.flushDirectory()
    return expectedDigest
  }
}
