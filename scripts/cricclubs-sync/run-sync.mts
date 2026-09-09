// Loads Supabase creds from the repo's .env.local into process.env, then runs
// the sync. Keeps the service-role key out of any shell command. Env must be
// set BEFORE importing sync.ts (it reads process.env at module load), so we use
// a dynamic import after populating process.env.
import { readFileSync } from 'node:fs';

const envPath = '/Users/bmantrala/vibe-planner-repo/.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const [, k, v] = m;
  if (!process.env[k]) process.env[k] = v.trim();
}
// sync.ts reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; both are in .env.local.
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}

await import('./sync.ts');
