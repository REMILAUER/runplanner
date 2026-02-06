// ── Storage Service ───────────────────────────────────────────────
// Dual-write: localStorage (immediate, offline) + Supabase (debounced, cloud).
// localStorage acts as cache. Supabase is source of truth when available.

import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'runplanner_state';

let debounceTimer = null;

export const storage = {
  // ── Local (synchronous) ──

  loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  saveLocal(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota exceeded */ }
  },

  clearLocal() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  },

  // ── Remote (async, Supabase) ──

  async loadRemote(userId) {
    if (!supabase || !userId) return null;
    try {
      const { data, error } = await supabase
        .from('user_plans')
        .select('state')
        .eq('user_id', userId)
        .single();
      if (error) {
        console.warn('[storage] Erreur Supabase load:', error.message);
        return null;
      }
      return data?.state || null;
    } catch (err) {
      console.warn('[storage] Erreur réseau:', err.message);
      return null;
    }
  },

  saveRemote(userId, state) {
    if (!supabase || !userId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('user_plans')
          .upsert(
            { user_id: userId, state },
            { onConflict: 'user_id' }
          );
        if (error) {
          console.warn('[storage] Erreur Supabase save:', error.message);
        }
      } catch (err) {
        console.warn('[storage] Erreur réseau save:', err.message);
      }
    }, 500);
  },

  // ── Combined ──

  save(state, userId) {
    this.saveLocal(state);
    this.saveRemote(userId, state);
  },

  // Backward-compatible synchronous load (used for initial render)
  load() {
    return this.loadLocal();
  },
};
