// ── Supabase Client ───────────────────────────────────────────────
// Exports the Supabase client, or null if env vars are missing.
// This enables graceful degradation: the app works offline (localStorage only)
// when Supabase is not configured.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[RunPlanner] Variables Supabase manquantes (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). ' +
    'Mode hors-ligne : localStorage uniquement.'
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
