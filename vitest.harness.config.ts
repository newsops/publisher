import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/harness/__tests__/**/*.test.mjs'],
  },
})
