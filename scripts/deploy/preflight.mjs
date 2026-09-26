#!/usr/bin/env node

import { evaluatePreflight } from './preflight-core.mjs'
const production = process.argv.includes('--production')
const modeArgument = process.argv.find((argument) =>
  argument.startsWith('--mode='),
)
const mode = modeArgument?.split('=')[1] ?? 'platform'
const { missing, warnings } = evaluatePreflight({
  environment: process.env,
  production,
  mode,
})

if (missing.length > 0) {
  console.error('[deploy-preflight] not ready')
  for (const item of missing) console.error(`- ${item}`)
  for (const item of warnings) console.error(`- warning: ${item}`)
  process.exit(1)
}

console.log(
  `[deploy-preflight] ${production ? 'production' : 'local'} ${mode} prerequisites passed`,
)
for (const item of warnings) console.log(`- warning: ${item}`)
