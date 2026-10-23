import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import path from 'node:path'

export async function cliFixture(handler, callback) {
  const calls = []
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    const call = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: raw ? JSON.parse(raw) : undefined,
    }
    calls.push(call)
    const result = await handler(call)
    response.statusCode = result.status ?? 200
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(result.body))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const environment = {
    ...process.env,
    PUBLISHER_ADMIN_ORIGIN: `http://127.0.0.1:${server.address().port}`,
    PUBLISHER_API_TOKEN: 'private-token-sentinel',
  }
  const run = (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.resolve('packages/ops-cli/bin/publisher.mjs'), ...args, '--json'],
        { env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
      child.once('error', reject)
      child.once('close', (status) => {
        try {
          resolve({ status, body: JSON.parse(stdout), stdout, stderr })
        } catch (error) {
          reject(error)
        }
      })
    })
  try {
    return await callback({ run, calls })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

export const guidanceReply = {
  siteId: 'example',
  agentContext: {
    instructions: 'Never publish without a representative image.',
    revision: 4,
  },
}
