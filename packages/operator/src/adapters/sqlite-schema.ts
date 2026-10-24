import { closeSync, existsSync, lstatSync, openSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type {
  WorkspaceContent,
  WorkspaceLocation,
} from '../core/workspace-types'
import { encodeContent, sqliteFailure } from './sqlite-codec'
import { WorkspaceError } from '../contracts/errors'

const APPLICATION_ID = 0x5055424c
const SCHEMA_VERSION = 1

function assertPermissionSupport(): void {
  if (process.platform === 'win32')
    throw sqliteFailure(
      'UNSUPPORTED',
      'Private SQLite files require a verified Windows ACL and locking adapter',
    )
}

function assertPrivateFile(path: string): void {
  let stat: Stats
  try {
    stat = lstatSync(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw sqliteFailure('MISSING', 'workspace missing; create it explicitly')
    throw error
  }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw sqliteFailure(
      'CORRUPT',
      'workspace must be a private regular SQLite file',
    )
}

export function createSqlite(
  path: string,
  siteId: string,
  writerId: string,
  data: WorkspaceContent,
): DatabaseSync {
  assertPermissionSupport()
  if (existsSync(path))
    throw sqliteFailure('EXISTS', 'workspace already exists')
  const descriptor = openSync(path, 'wx', 0o600)
  closeSync(descriptor)
  const db = new DatabaseSync(path)
  try {
    db.exec(
      'PRAGMA busy_timeout = 0; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; BEGIN IMMEDIATE',
    )
    db.exec(
      `PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${SCHEMA_VERSION}`,
    )
    db.exec(
      'CREATE TABLE workspace (singleton INTEGER PRIMARY KEY CHECK(singleton=1), site_id TEXT NOT NULL, writer_id TEXT NOT NULL, revision INTEGER NOT NULL, synced_revision INTEGER, payload TEXT NOT NULL, digest TEXT NOT NULL, recovery_copy INTEGER NOT NULL DEFAULT 0 CHECK(recovery_copy IN (0,1))) STRICT',
    )
    db.exec(
      'CREATE TABLE mutations (operation_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL) STRICT',
    )
    db.exec(
      'CREATE TABLE operations (operation_id TEXT PRIMARY KEY, intent TEXT NOT NULL, payload_digest TEXT, commit_id TEXT, captured_revision INTEGER, namespace TEXT, head_id TEXT, sequence INTEGER, CHECK((commit_id IS NULL) = (captured_revision IS NULL)), CHECK((commit_id IS NULL) = (namespace IS NULL)), CHECK((commit_id IS NULL) = (head_id IS NULL)), CHECK((commit_id IS NULL) = (sequence IS NULL))) STRICT',
    )
    db.exec(
      'CREATE TABLE remote_checkpoints (namespace TEXT PRIMARY KEY, commit_id TEXT NOT NULL, head_id TEXT NOT NULL, sequence INTEGER NOT NULL) STRICT',
    )
    const encoded = encodeContent(data)
    db.prepare('INSERT INTO workspace VALUES (1, ?, ?, 0, NULL, ?, ?, 0)').run(
      siteId,
      writerId,
      encoded.payload,
      encoded.digest,
    )
    db.exec('COMMIT')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function openSqlite(input: WorkspaceLocation): DatabaseSync {
  assertPermissionSupport()
  assertPrivateFile(input.path)
  const db = new DatabaseSync(input.path, { enableForeignKeyConstraints: true })
  try {
    if (
      db.prepare('PRAGMA application_id').get()?.application_id !==
        APPLICATION_ID ||
      db.prepare('PRAGMA user_version').get()?.user_version !== SCHEMA_VERSION
    )
      throw sqliteFailure('CORRUPT', 'unrecognized or corrupt workspace schema')
    if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok')
      throw sqliteFailure('CORRUPT', 'corrupt SQLite workspace')
    if (
      db.prepare('SELECT site_id FROM workspace WHERE singleton=1').get()
        ?.site_id !== input.siteId
    )
      throw sqliteFailure('VALIDATION', 'workspace site identity mismatch')
    db.exec('PRAGMA busy_timeout = 0; PRAGMA synchronous = FULL')
    return db
  } catch (error) {
    db.close()
    if (error instanceof WorkspaceError) throw error
    throw sqliteFailure('CORRUPT', 'corrupt SQLite workspace')
  }
}
