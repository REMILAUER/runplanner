// ── Storage Service V3 ────────────────────────────────────────────
// Granular CRUD for normalized DB tables + localStorage cache.
// localStorage = read cache for instant render. Supabase = source of truth.

import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'runplanner_state';

let debounceTimer = null;

export const storage = {
  // ══════════════════════════════════════════════════════════════════
  // LOCAL (synchronous cache layer)
  // ══════════════════════════════════════════════════════════════════

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
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  },

  // Backward-compatible synchronous load
  load() {
    return this.loadLocal();
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGACY (for migration — reads old blob from user_plans)
  // ══════════════════════════════════════════════════════════════════

  async loadRemote(userId) {
    if (!supabase || !userId) return null;
    try {
      const { data, error } = await supabase
        .from('user_plans')
        .select('state')
        .eq('user_id', userId)
        .single();
      if (error) return null;
      return data?.state || null;
    } catch { return null; }
  },

  // Legacy dual-write (still writes to old blob during transition)
  saveLegacyBlob(userId, state) {
    if (!supabase || !userId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await supabase
          .from('user_plans')
          .upsert({ user_id: userId, state }, { onConflict: 'user_id' });
      } catch { /* ignore */ }
    }, 500);
  },

  // Combined save (localStorage + legacy blob)
  save(state, userId) {
    this.saveLocal(state);
    this.saveLegacyBlob(userId, state);
  },

  // ══════════════════════════════════════════════════════════════════
  // PROFILE (profiles table — merges old profile+history+availability)
  // ══════════════════════════════════════════════════════════════════

  async loadProfile(userId) {
    if (!supabase || !userId) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error || !data) return null;
      // Map DB snake_case → app camelCase
      return {
        firstName: data.first_name || '',
        gender: data.gender || '',
        birthDate: data.birth_date || '',
        refDistance: data.ref_distance || '',
        refTime: data.ref_time || '',
        yearKm: data.year_km != null ? String(data.year_km) : '',
        avgWeekKm: data.avg_week_km != null ? String(data.avg_week_km) : '',
        lastWeekKm: data.last_week_km != null ? String(data.last_week_km) : '',
        sessionsPerWeek: data.sessions_per_week || 4,
        trainingDays: data.training_days || ['Mar', 'Jeu', 'Sam'],
      };
    } catch { return null; }
  },

  async saveProfile(userId, data) {
    if (!supabase || !userId) return null;
    try {
      const row = {
        user_id: userId,
        first_name: data.firstName || null,
        gender: data.gender || null,
        birth_date: data.birthDate || null,
        ref_distance: data.refDistance || null,
        ref_time: data.refTime || null,
        year_km: data.yearKm ? parseFloat(data.yearKm) : null,
        avg_week_km: data.avgWeekKm ? parseFloat(data.avgWeekKm) : null,
        last_week_km: data.lastWeekKm ? parseFloat(data.lastWeekKm) : null,
        sessions_per_week: data.sessionsPerWeek || 4,
        training_days: data.trainingDays || ['Mar', 'Jeu', 'Sam'],
      };
      const { data: result, error } = await supabase
        .from('profiles')
        .upsert(row, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) console.warn('[storage] saveProfile error:', error.message);
      return result;
    } catch (err) {
      console.warn('[storage] saveProfile error:', err.message);
      return null;
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // PLAN
  // ══════════════════════════════════════════════════════════════════

  async loadActivePlan(userId) {
    if (!supabase || !userId) return null;
    try {
      const { data: plan, error } = await supabase
        .from('plans')
        .select(`
          id, name, status, start_date, paces, warnings, created_at,
          objectives (id, date, distance, type, sort_order),
          cycles (id, objective_id, type, start_date, total_weeks, phases, volume_schedule, sort_order)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !plan) return null;

      // Sort objectives and cycles
      if (plan.objectives) plan.objectives.sort((a, b) => a.sort_order - b.sort_order);
      if (plan.cycles) plan.cycles.sort((a, b) => a.sort_order - b.sort_order);

      return plan;
    } catch { return null; }
  },

  async createPlan(userId, { name, startDate, paces, warnings }) {
    if (!supabase || !userId) return null;
    try {
      // Archive any existing active plans
      await supabase
        .from('plans')
        .update({ status: 'archived' })
        .eq('user_id', userId)
        .eq('status', 'active');

      const { data, error } = await supabase
        .from('plans')
        .insert({
          user_id: userId,
          name: name || 'Mon plan',
          status: 'active',
          start_date: startDate,
          paces,
          warnings: warnings || [],
        })
        .select('id')
        .single();
      if (error) { console.warn('[storage] createPlan error:', error.message); return null; }
      return data.id;
    } catch (err) {
      console.warn('[storage] createPlan error:', err.message);
      return null;
    }
  },

  async updatePlan(planId, updates) {
    if (!supabase || !planId) return;
    try {
      const { error } = await supabase
        .from('plans')
        .update(updates)
        .eq('id', planId);
      if (error) console.warn('[storage] updatePlan error:', error.message);
    } catch { /* ignore */ }
  },

  // ══════════════════════════════════════════════════════════════════
  // OBJECTIVES
  // ══════════════════════════════════════════════════════════════════

  async saveObjectives(planId, objectives) {
    if (!supabase || !planId) return [];
    try {
      // Delete existing
      await supabase.from('objectives').delete().eq('plan_id', planId);

      if (!objectives || objectives.length === 0) return [];

      const rows = objectives.map((obj, i) => ({
        plan_id: planId,
        date: obj.date,
        distance: obj.distance,
        type: obj.type,
        sort_order: i,
      }));

      const { data, error } = await supabase
        .from('objectives')
        .insert(rows)
        .select('id, sort_order');
      if (error) { console.warn('[storage] saveObjectives error:', error.message); return []; }
      return data;
    } catch { return []; }
  },

  // ══════════════════════════════════════════════════════════════════
  // CYCLES
  // ══════════════════════════════════════════════════════════════════

  async saveCycles(planId, cycles, objectiveIds) {
    if (!supabase || !planId) return [];
    try {
      // Delete existing cycles (cascades to weeks → sessions → steps)
      await supabase.from('cycles').delete().eq('plan_id', planId);

      if (!cycles || cycles.length === 0) return [];

      const rows = cycles.map((cycle, i) => ({
        plan_id: planId,
        objective_id: objectiveIds?.[i] || null,
        type: cycle.type || 'full_cycle',
        start_date: cycle.startDate instanceof Date
          ? cycle.startDate.toISOString().split('T')[0]
          : cycle.startDate || null,
        total_weeks: cycle.volumeSchedule?.length || cycle.phases?.totalWeeks || null,
        phases: cycle.phases || null,
        volume_schedule: cycle.volumeSchedule || null,
        sort_order: i,
      }));

      const { data, error } = await supabase
        .from('cycles')
        .insert(rows)
        .select('id, sort_order');
      if (error) { console.warn('[storage] saveCycles error:', error.message); return []; }
      return data.sort((a, b) => a.sort_order - b.sort_order).map(c => c.id);
    } catch { return []; }
  },

  // ══════════════════════════════════════════════════════════════════
  // WEEKS + SESSIONS + STEPS (batch write)
  // ══════════════════════════════════════════════════════════════════

  async saveGeneratedPlan(cycleId, dbWeeks) {
    if (!supabase || !cycleId || !dbWeeks) return;
    try {
      // Delete existing weeks for this cycle (cascades to sessions → steps)
      await supabase.from('weeks').delete().eq('cycle_id', cycleId);

      // 1. Insert weeks
      const weekRows = dbWeeks.map(w => ({
        cycle_id: cycleId,
        week_number: w.weekNumber,
        phase: w.phase,
        target_volume: w.targetVolume,
        start_date: w.startDate,
        is_assimilation: w.isAssimilation,
      }));

      const { data: insertedWeeks, error: weekErr } = await supabase
        .from('weeks')
        .insert(weekRows)
        .select('id, week_number');
      if (weekErr) { console.error('[storage] weeks insert error:', weekErr.message); return; }

      // Build week_number → id map
      const weekIdMap = {};
      insertedWeeks.forEach(w => { weekIdMap[w.week_number] = w.id; });

      // 2. Insert sessions
      const sessionRows = [];
      const sessionMeta = [];
      dbWeeks.forEach(w => {
        const weekId = weekIdMap[w.weekNumber];
        if (!weekId) return;
        w.sessions.forEach(s => {
          sessionRows.push({
            week_id: weekId,
            day_name: s.dayName,
            date: s.date,
            sort_order: s.sortOrder,
            type: s.type,
            title: s.title,
            source_template_id: s.sourceTemplateId,
            is_custom: false,
            target_duration_min: s.targetDurationMin,
            target_distance_km: s.targetDistanceKm,
            description: s.description,
            notes: s.notes,
            coach_tips: s.coachTips,
          });
          sessionMeta.push(s.steps || []);
        });
      });

      if (sessionRows.length === 0) return;

      const { data: insertedSessions, error: sessErr } = await supabase
        .from('sessions')
        .insert(sessionRows)
        .select('id');
      if (sessErr) { console.error('[storage] sessions insert error:', sessErr.message); return; }

      // 3. Insert steps
      const stepRows = [];
      insertedSessions.forEach((sess, idx) => {
        const steps = sessionMeta[idx];
        if (!steps) return;
        steps.forEach(step => {
          stepRows.push({
            session_id: sess.id,
            sort_order: step.sortOrder,
            step_type: step.stepType,
            duration_sec: step.durationSec || null,
            distance_m: step.distanceM || null,
            pace_zone: step.paceZone || null,
            pace_min_sec_km: step.paceMinSecKm || null,
            pace_max_sec_km: step.paceMaxSecKm || null,
            reps: step.reps || null,
            recovery_duration_sec: step.recoveryDurationSec || null,
            recovery_type: step.recoveryType || null,
            sets: step.sets || null,
            recovery_between_sets_sec: step.recoveryBetweenSetsSec || null,
            label: step.label || null,
            description: step.description || null,
          });
        });
      });

      if (stepRows.length > 0) {
        // Batch in chunks of 500
        for (let i = 0; i < stepRows.length; i += 500) {
          const chunk = stepRows.slice(i, i + 500);
          const { error: stepErr } = await supabase.from('session_steps').insert(chunk);
          if (stepErr) console.error('[storage] steps insert error:', stepErr.message);
        }
      }
    } catch (err) {
      console.error('[storage] saveGeneratedPlan error:', err.message);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // READ: weeks + sessions + steps for a cycle
  // ══════════════════════════════════════════════════════════════════

  async loadWeeksForCycle(cycleId) {
    if (!supabase || !cycleId) return [];
    try {
      const { data, error } = await supabase
        .from('weeks')
        .select(`
          id, week_number, phase, target_volume, start_date, is_assimilation, notes,
          sessions (
            id, day_name, date, sort_order, type, title, source_template_id, is_custom,
            target_duration_min, target_distance_km, description, notes, coach_tips,
            session_steps (
              id, sort_order, step_type, duration_sec, distance_m,
              pace_zone, pace_min_sec_km, pace_max_sec_km,
              reps, recovery_duration_sec, recovery_type,
              parent_step_id, sets, recovery_between_sets_sec,
              label, description
            )
          )
        `)
        .eq('cycle_id', cycleId)
        .order('week_number', { ascending: true });

      if (error) { console.warn('[storage] loadWeeksForCycle error:', error.message); return []; }

      // Sort sessions and steps within each week
      (data || []).forEach(week => {
        if (week.sessions) {
          week.sessions.sort((a, b) => a.sort_order - b.sort_order);
          week.sessions.forEach(s => {
            if (s.session_steps) {
              s.session_steps.sort((a, b) => a.sort_order - b.sort_order);
            }
          });
        }
      });

      return data || [];
    } catch { return []; }
  },

  // ══════════════════════════════════════════════════════════════════
  // MIGRATION: old JSONB blob → normalized tables
  // ══════════════════════════════════════════════════════════════════

  async migrateFromBlob(userId, blob) {
    if (!supabase || !userId || !blob) return null;
    try {
      console.log('[storage] Starting migration from blob...');

      // 1. Profile (merge profile + history + availability)
      const profileData = {
        firstName: blob.profile?.firstName || '',
        gender: blob.profile?.gender || '',
        birthDate: blob.profile?.birthDate || '',
        refDistance: blob.profile?.refDistance || '',
        refTime: blob.profile?.refTime || '',
        yearKm: blob.history?.yearKm || '',
        avgWeekKm: blob.history?.avgWeekKm || '',
        lastWeekKm: blob.history?.lastWeekKm || '',
        sessionsPerWeek: blob.availability?.sessionsPerWeek || 4,
        trainingDays: blob.availability?.trainingDays || ['Mar', 'Jeu', 'Sam'],
      };
      await this.saveProfile(userId, profileData);

      if (!blob.plan || !blob.plan.cycles || blob.plan.cycles.length === 0) {
        console.log('[storage] No plan to migrate.');
        return { profileData, planId: null };
      }

      // 2. Plan
      const objName = blob.objectives?.[0]
        ? `Prépa ${blob.objectives[0].distance} ${blob.objectives[0].date}`
        : 'Mon plan';

      const startDate = blob.plan.cycles[0]?.startDate
        ? new Date(blob.plan.cycles[0].startDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const planId = await this.createPlan(userId, {
        name: objName,
        startDate,
        paces: blob.paces || null,
        warnings: blob.plan.warnings || [],
      });

      if (!planId) {
        console.warn('[storage] Migration: failed to create plan');
        return { profileData, planId: null };
      }

      // 3. Objectives
      const insertedObjectives = await this.saveObjectives(planId, blob.objectives || []);

      // 4. Cycles — map objective IDs
      const objectiveIds = blob.plan.cycles.map((cycle, i) => {
        if (!cycle.objective) return null;
        return insertedObjectives?.[i]?.id || null;
      });

      const cycleIds = await this.saveCycles(planId, blob.plan.cycles, objectiveIds);

      console.log('[storage] Migration complete. Plan:', planId, 'Cycles:', cycleIds.length);
      return { profileData, planId, cycleIds };
    } catch (err) {
      console.error('[storage] Migration error:', err.message);
      return null;
    }
  },
};
