import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Loaded eagerly here (config-evaluation time) so SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are in process.env before any test file imports
// lib/supabase.ts, whose module-level createClient() call reads them.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    test: {
      environment: 'node',
      include: ['src/__integration__/**/*.integration.test.ts'],
      testTimeout: 15000,
      // Tests share state via truncate-between-tests cleanup; concurrent
      // files would truncate out from under each other.
      fileParallelism: false,
    },
  };
});