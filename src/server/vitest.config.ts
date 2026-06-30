import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Scoped to the existing __tests__/ convention so src/__integration__
    // (real local Postgres, see test:integration) never runs as part of the
    // default, mock-only, Docker-free suite.
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
