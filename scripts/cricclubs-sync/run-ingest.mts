// Loads Supabase creds from .env.local, then runs ingest-html.mts with the
// HTML file paths you pass through. Keeps the service-role key off the shell.
//   node_modules/.bin/tsx run-ingest.mts <file1.html> [file2.html ...]
import { readFileSync } from 'node:fs';

const envPath = '/Users/bmantrala/vibe-planner-repo/.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const [, k, v] = m;
  if (!process.env[k]) process.env[k] = v.trim();
}
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}

await import('./ingest-html.mts');
