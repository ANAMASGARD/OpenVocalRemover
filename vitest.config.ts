import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Built-manifest inspection rebuilds both browser targets once.
    testTimeout: 120_000,
  },
})
