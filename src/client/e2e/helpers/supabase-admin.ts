import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Server-role credentials for test fixture setup/teardown only — read from
// the server workspace's own env file rather than duplicating the secret
// into the client workspace. `process.cwd()` is `src/client` because npm
// workspace scripts run with cwd set to the package directory.
function readServerEnv(): Record<string, string> {
  const filePath = path.resolve(process.cwd(), '../server/.env.local');
  const raw = readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const serverEnv = readServerEnv();

export const supabaseAdmin = createClient(
  serverEnv.SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY
);
