// Thin Supabase client wrapper for the scraper.
// Uses service_role to bypass RLS — only safe inside the GitHub Action
// (or with a key explicitly placed in .env.local for local testing).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const makeServiceRoleClient = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'cricclubs-sync' } },
  });
};

// ── Roster helpers ──────────────────────────────────────────────────────

export type RosterRow = {
  id: string;
  name: string;
  cricclub_id: string | null;
};

// Loads active players for a team and returns case-insensitive name → id and
// cricclub_id → id maps. Both are populated from the same query.
export const loadRoster = async (
  client: SupabaseClient,
  teamId: string,
): Promise<{ byName: Map<string, string>; byCricclubId: Map<string, string> }> => {
  const { data, error } = await client
    .from('cricket_players')
    .select('id, name, cricclub_id')
    .eq('team_id', teamId)
    .eq('is_active', true);
  if (error) throw new Error(`loadRoster failed: ${error.message}`);

  const byName = new Map<string, string>();
  const byCricclubId = new Map<string, string>();
  for (const row of (data ?? []) as RosterRow[]) {
    const key = row.name.trim().toLowerCase();
    if (key) byName.set(key, row.id);
    if (row.cricclub_id) byCricclubId.set(row.cricclub_id, row.id);
  }
  return { byName, byCricclubId };
};

// Resolves a cricclubs scorecard name to a cricket_players.id, or null
// if the player isn't on our roster (e.g., opposition player).
export const resolvePlayerId = (
  cricclubsName: string,
  byName: Map<string, string>,
): string | null => {
  return byName.get(cricclubsName.trim().toLowerCase()) ?? null;
};
