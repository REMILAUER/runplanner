import { selectSession, selectSessionByRPE, buildSessionFromLibrary } from './sessionResolver';
import { formatPace } from './vdot';
import { PHASE_COLORS, SESSION_TYPES, DAYS_LIST, SL_MAX_KM, SL_MAX_DURATION_MIN, VOLUME_DISTRIBUTION } from '../data/constants';
import { FONT } from '../styles/tokens';

// ── Shared components ───────────────────────────────────────────────

export function generateFutureDates() {
  const dates = [];
  const now = new Date();
  const labels = ["dans 2 mois", "dans 3 mois", "dans 4 mois", "dans 6 mois", "dans 8 mois", "dans 10 mois", "dans 12 mois"];
  const offsets = [2, 3, 4, 6, 8, 10, 12];
  offsets.forEach((m, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    const iso = d.toISOString().split("T")[0];
    const formatted = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    dates.push({ iso, label: `${formatted} (${labels[i]})` });
  });
  return dates;
}
export const FUTURE_DATES = generateFutureDates();

// Compute phase boundaries for progression tracking
export function computePhaseBoundaries(volumeSchedule) {
  const boundaries = {};
  let currentPhase = null, startIdx = 0;
  volumeSchedule.forEach((w, idx) => {
    if (w.phase !== currentPhase) {
      if (currentPhase) boundaries[currentPhase].total = idx - startIdx;
      currentPhase = w.phase;
      startIdx = idx;
      boundaries[currentPhase] = { start: startIdx, total: 0 };
    }
  });
  if (currentPhase) boundaries[currentPhase].total = volumeSchedule.length - boundaries[currentPhase].start;
  return boundaries;
}

// ── V2 Session Generation ─────────────────────────────────────────────
// Architecture: 4 internal functions (buildSessionSlots → resolveSlot →
// distributeVolume → assignToDays) replace the V1 per-phase if/else blocks.

// ── Distance → SPECIFIQUE target_race mapping ──
const DISTANCE_TO_RACE = {
  "5km": "5km",
  "10km": "10km",
  "Semi Marathon": "semi",
  "Marathon": "marathon",
};

// ── 1. buildSessionSlots ──
// Returns slot descriptors: [{ role, type, targetRPE, volumePct, targetRace? }]
//
// Design principles:
// - quality_low NEVER exceeds RPE 6 (prevents overload bug)
// - quality_high capped at RPE 7 (Construction) / RPE 8 (Spécifique)
// - RPE 9 only if weekVolume ≥ 50km
// - SPECIFIQUE type used in Spécifique phase (filtered by distance)
// - Varied types across phases (VMA_COURTE, VMA_LONGUE, SEUIL2, TEMPO, SPECIFIQUE)
// - Assimilation weeks: all ≤ RPE 4, no quality sessions
function buildSessionSlots(phase, ratio, nbSessions, isAssim, distance, weekVolume) {
  const slots = [];

  // Phase progression sub-phase (début/milieu/fin)
  const subPhase = ratio < 0.33 ? "début" : ratio < 0.66 ? "milieu" : "fin";
  const targetRace = DISTANCE_TO_RACE[distance] || null;

  // Helper: alternate footing length (short/long) for variety
  let footingIdx = 0;
  function nextFootingSlot(rpe) {
    const isLong = footingIdx % 2 === 0; // first footing = long, second = short, etc.
    footingIdx++;
    return {
      role: "footing", type: "FOOTING", targetRPE: rpe, volumePct: 0,
      footingLength: isLong ? "long" : "short",
    };
  }

  if (phase === "Base") {
    // 1 SL RPE 3-4, rest footings RPE 2-3
    // From week 2+ (ratio > 0): introduce 1 VMA courte quality session (RPE 5→6)
    slots.push({ role: "sl", type: "SORTIE_LONGUE", targetRPE: isAssim ? 3 : 4, volumePct: VOLUME_DISTRIBUTION.SL_PCT });

    const introduceVMA = !isAssim && ratio > 0 && nbSessions >= 3;
    if (introduceVMA) {
      const vmaRPE = ratio < 0.5 ? 5 : 6;
      slots.push({ role: "quality_low", type: "VMA_COURTE", targetRPE: vmaRPE, volumePct: VOLUME_DISTRIBUTION.QUALITY_LOW_PCT });
    }

    while (slots.length < nbSessions) {
      slots.push(nextFootingSlot(isAssim ? 2 : 3));
    }

  } else if (phase === "Construction") {
    if (isAssim) {
      slots.push({ role: "sl", type: "SORTIE_LONGUE", targetRPE: 3, volumePct: VOLUME_DISTRIBUTION.SL_PCT });
      for (let i = 1; i < nbSessions; i++) {
        slots.push(nextFootingSlot(3));
      }
    } else {
      // quality_high: SEUIL2 with progressive RPE (5→6→7)
      const qualityHighType = "SEUIL2";
      const qualityHighRPE = subPhase === "début" ? 5 : subPhase === "milieu" ? 6 : 7;
      const slRPE = subPhase === "début" ? 4 : subPhase === "milieu" ? 5 : 6;

      slots.push({ role: "quality_high", type: qualityHighType, targetRPE: qualityHighRPE, volumePct: VOLUME_DISTRIBUTION.QUALITY_HIGH_PCT });
      slots.push({ role: "sl", type: "SORTIE_LONGUE", targetRPE: slRPE, volumePct: VOLUME_DISTRIBUTION.SL_PCT });

      // quality_low (5+ sessions): VMA with RPE capped at 6
      if (nbSessions >= 5) {
        const secondType = subPhase === "fin" ? "VMA_LONGUE" : "VMA_COURTE";
        const secondRPE = 5; // always RPE 5 — never exceeds 6
        slots.push({ role: "quality_low", type: secondType, targetRPE: secondRPE, volumePct: VOLUME_DISTRIBUTION.QUALITY_LOW_PCT });
      }

      // Fill remaining with recovery + footings
      const filled = slots.length;
      if (nbSessions >= filled + 1) {
        slots.push({ role: "recup", type: "FOOTING", targetRPE: 2, volumePct: VOLUME_DISTRIBUTION.RECUP_PCT });
      }
      while (slots.length < nbSessions) {
        slots.push(nextFootingSlot(3));
      }
    }

  } else if (phase === "Spécifique") {
    if (isAssim) {
      slots.push({ role: "sl", type: "SORTIE_LONGUE", targetRPE: 3, volumePct: VOLUME_DISTRIBUTION.SL_PCT });
      for (let i = 1; i < nbSessions; i++) {
        slots.push(nextFootingSlot(3));
      }
    } else {
      // quality_high: SPECIFIQUE sessions filtered by distance
      // Falls back to TEMPO if no SPECIFIQUE match
      const qualityHighType = targetRace ? "SPECIFIQUE" : "TEMPO";
      const qualityHighRPE = subPhase === "début" ? 7 : 8;
      // Cap at RPE 8 unless high volume
      const clampedHighRPE = weekVolume < 50 ? Math.min(qualityHighRPE, 8) : qualityHighRPE;

      const slRPE = subPhase === "début" ? 6 : subPhase === "fin" ? 7 : 7;
      const clampedSlRPE = weekVolume < 40 ? Math.min(slRPE, 6) : slRPE;

      slots.push({
        role: "quality_high", type: qualityHighType, targetRPE: clampedHighRPE,
        volumePct: VOLUME_DISTRIBUTION.QUALITY_HIGH_PCT,
        ...(targetRace ? { targetRace } : {}),
      });
      slots.push({ role: "sl", type: "SORTIE_LONGUE", targetRPE: clampedSlRPE, volumePct: VOLUME_DISTRIBUTION.SL_PCT });

      // quality_low (5+ sessions): progressive SEUIL2→TEMPO, RPE 5→6 max
      if (nbSessions >= 5) {
        const secondType = subPhase === "début" ? "SEUIL2" : "TEMPO";
        const secondRPE = subPhase === "fin" ? 6 : 5; // capped at 6
        slots.push({ role: "quality_low", type: secondType, targetRPE: secondRPE, volumePct: VOLUME_DISTRIBUTION.QUALITY_LOW_PCT });
      }

      const filled = slots.length;
      if (nbSessions >= filled + 1) {
        slots.push({ role: "recup", type: "FOOTING", targetRPE: 2, volumePct: VOLUME_DISTRIBUTION.RECUP_PCT });
      }
      while (slots.length < nbSessions) {
        slots.push(nextFootingSlot(3));
      }
    }

  } else if (phase === "Affûtage") {
    const isLastWeek = ratio >= 0.8;

    if (!isLastWeek && nbSessions >= 3) {
      slots.push({ role: "quality_low", type: "TEMPO", targetRPE: 5, volumePct: VOLUME_DISTRIBUTION.QUALITY_LOW_PCT });
    }

    // Remaining all easy
    while (slots.length < nbSessions) {
      const rpe = isLastWeek ? 2 : 3;
      if (slots.length === 0 || slots.every(s => s.role !== "sl")) {
        slots.push({ role: "sl", type: "SORTIE_LONGUE", targetRPE: 3, volumePct: VOLUME_DISTRIBUTION.SL_PCT });
      } else {
        slots.push(nextFootingSlot(rpe));
      }
    }
  }

  return slots;
}

// ── 2. resolveSlot ──
// Tries selectSessionByRPE (with anti-repetition), falls back to selectSession, then hardcoded inline
function resolveSlot(slot, phase, ratio, paces, weekInPhase, totalWeeksInPhase, targetKm, usedIds = new Set()) {
  // Try RPE-based selection first (with anti-repetition & targetRace filter)
  let entry = selectSessionByRPE(slot.type, phase, slot.targetRPE, usedIds, slot.targetRace || null);

  // Fallback to level-based selection
  if (!entry) {
    entry = selectSession(slot.type, phase, weekInPhase, totalWeeksInPhase);
  }

  // Track used ID for anti-repetition
  if (entry && entry.id) {
    usedIds.add(entry.id);
  }

  if (entry) {
    return buildSessionFromLibrary(entry, targetKm, paces, slot.type);
  }

  // Ultimate fallback: hardcoded inline sessions
  const easyPace = paces?.Easy ? `${formatPace(paces.Easy.slow)}-${formatPace(paces.Easy.fast)}` : "5:30-6:00";
  const tempoPace = paces?.Tempo ? `${formatPace(paces.Tempo.fast)}-${formatPace(paces.Tempo.slow)}` : "4:30-4:50";
  const seuilPace = paces?.Seuil2 ? `${formatPace(paces.Seuil2.fast)}-${formatPace(paces.Seuil2.slow)}` : "4:15-4:30";

  if (slot.type === "SORTIE_LONGUE") {
    return {
      type: "SL", title: "Sortie longue", duration: `${Math.round(targetKm * 5.5)}min`,
      distance: targetKm,
      warmup: { duration: "—", pace: "—", description: "Pas d'échauffement spécifique" },
      main: [{ description: "Course continue, départ lent puis allure stable", duration: `${Math.round(targetKm * 5.5)}min`, pace: easyPace }],
      cooldown: { duration: "5min", pace: easyPace, description: "Marche + étirements" },
      notes: "Emportez de l'eau si >1h. Restez en zone confortable.",
    };
  }

  if (slot.type === "SEUIL2") {
    return {
      type: "SEUIL", title: "Seuil", duration: "55-60min",
      distance: targetKm,
      warmup: { duration: "15min", pace: easyPace, description: "Footing + accélérations" },
      main: [{ description: "3 × 10min @ allure seuil", duration: "30min", pace: seuilPace }],
      cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
      notes: "Allure seuil = inconfortable mais tenable.",
    };
  }

  if (slot.type === "VMA_COURTE") {
    const vmaPace = paces?.VMACourte ? `${formatPace(paces.VMACourte.fast)}-${formatPace(paces.VMACourte.slow)}` : "3:45-4:00";
    return {
      type: "VMA", title: "VMA courte", duration: "50-55min",
      distance: targetKm,
      warmup: { duration: "20min", pace: easyPace, description: "Footing + gammes" },
      main: [{ description: "10 × 300m @ VMA", duration: "15min effort", pace: vmaPace }],
      cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
      notes: "Régularité > vitesse.",
    };
  }

  if (slot.type === "TEMPO") {
    return {
      type: "TEMPO", title: "Tempo", duration: `${Math.round(targetKm * 5)}min`,
      distance: targetKm,
      warmup: { duration: "15min", pace: easyPace, description: "Footing + accélérations" },
      main: [{ description: "2 × 15min @ allure objectif", duration: "30min", pace: tempoPace }],
      cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
      notes: "Allure cible. Mémorisez les sensations.",
    };
  }

  // Default: footing
  return {
    type: "EF", title: slot.role === "recup" ? "Footing récupération" : "Footing endurance",
    duration: `${Math.round(targetKm * 5.5)}min`,
    distance: targetKm,
    warmup: { duration: "—", pace: "—", description: "—" },
    main: [{ description: slot.role === "recup" ? "Footing très lent" : "Footing en endurance", duration: `${Math.round(targetKm * 5.5)}min`, pace: easyPace }],
    cooldown: { duration: "5min", pace: "—", description: "Étirements" },
    notes: slot.role === "recup" ? "Récupération active." : "Course facile, aisance respiratoire.",
  };
}

// ── 3. distributeVolume ──
// Assigns km to each session based on role percentages & SL cap
function distributeVolume(sessions, slots, weekVolume, distance) {
  const slMaxKm = (SL_MAX_KM && SL_MAX_KM[distance]) || 30;

  // First pass: assign km to sessions with volumePct
  let allocated = 0;
  const footingIndices = [];

  sessions.forEach((session, i) => {
    const slot = slots[i];
    if (!slot) return;

    if (slot.role === "sl") {
      const targetKm = Math.min(weekVolume * slot.volumePct, slMaxKm);
      session.distance = Math.round(targetKm);
      allocated += session.distance;
    } else if (slot.volumePct > 0) {
      const targetKm = weekVolume * slot.volumePct;
      session.distance = Math.round(targetKm);
      allocated += session.distance;
    } else {
      footingIndices.push(i);
    }
  });

  // Distribute remaining km across footings with weighting (long ×1.6, short ×1.0)
  const remaining = Math.max(0, weekVolume - allocated);
  if (footingIndices.length > 0) {
    const weights = footingIndices.map(i => {
      const fl = slots[i]?.footingLength;
      return fl === "long" ? 1.6 : 1.0;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    footingIndices.forEach((fi, wi) => {
      const share = (weights[wi] / totalWeight) * remaining;
      sessions[fi].distance = Math.max(1, Math.round(share));
    });
  }
}

// ── 3b. capSlDuration ──
// Caps the SL distance so its estimated duration stays within the phase limit.
// Uses an average easy pace (~5.5min/km fallback) or paces object if available.
function capSlDuration(sessions, slots, phase, distance, paces) {
  const maxDurMin = SL_MAX_DURATION_MIN?.[phase]?.[distance];
  if (!maxDurMin) return;

  sessions.forEach((session, i) => {
    const slot = slots[i];
    if (!slot || slot.role !== "sl") return;

    // Estimate pace in min/km for Easy zone
    let paceMinPerKm = 5.5; // fallback
    if (paces?.Easy) {
      paceMinPerKm = ((paces.Easy.slow + paces.Easy.fast) / 2) / 60;
    }

    const distKm = typeof session.distance === "number"
      ? session.distance
      : (session.distance?.low || 0);
    const estDurMin = distKm * paceMinPerKm;

    if (estDurMin > maxDurMin) {
      const cappedKm = Math.round(maxDurMin / paceMinPerKm);
      session.distance = cappedKm;
    }
  });
}

// ── 3c. recalcDurations ──
// After distributeVolume + capSlDuration changed distances, recalculate durations
// to match the new distances. Only affects distance-based sessions (EF, SL).
// Quality sessions (VMA, SEUIL, TEMPO) keep their structured duration.
function recalcDurations(sessions, slots, paces) {
  // Easy pace in min/km (fallback 5.5)
  let easyPaceMinKm = 5.5;
  if (paces?.Easy) {
    easyPaceMinKm = ((paces.Easy.slow + paces.Easy.fast) / 2) / 60;
  }

  const DISTANCE_TYPES = new Set(["EF", "SL"]);

  sessions.forEach((session, i) => {
    if (!DISTANCE_TYPES.has(session.type)) return; // quality sessions → keep original duration

    const distKm = typeof session.distance === "number"
      ? session.distance
      : (session.distance?.low || 0);
    if (distKm <= 0) return;

    // Main duration from distance × pace, apply duration_factor for footings
    let mainMin = distKm * easyPaceMinKm;
    if (session.type === "EF" && session._durationFactor) {
      mainMin *= session._durationFactor;
    }

    // Adaptive warmup/cooldown
    const isQuality = false; // EF/SL → no structured warmup for SL, yes for some EF
    const hasWarmup = session.warmup && session.warmup.duration !== "—";
    let warmupMin = 0, cooldownMin = 5;

    if (hasWarmup) {
      if (mainMin <= 20) { warmupMin = 12; cooldownMin = 8; }
      else if (mainMin <= 40) { warmupMin = 15; cooldownMin = 10; }
      else if (mainMin <= 60) { warmupMin = 18; cooldownMin = 10; }
      else { warmupMin = 20; cooldownMin = 12; }
    }

    const totalMin = Math.round(warmupMin + mainMin + cooldownMin);

    // Update session fields
    session.duration = totalMin > 60
      ? `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, "0")}`
      : `${totalMin}min`;
    session._targetDurationMin = totalMin;
    session._targetDistanceKm = distKm;

    // Update warmup/cooldown display
    if (hasWarmup) {
      session.warmup.duration = `${warmupMin}min`;
    }
    if (session.cooldown) {
      session.cooldown.duration = `${cooldownMin}min`;
    }

    // Update main block durations for SL/EF (simple single-block display)
    if (session.main && session.main.length > 0 && session.type === "EF") {
      session.main[0].duration = `${Math.round(mainMin)}min`;
    }
  });
}

// ── 4. assignToDays ──
// Places sessions on training days respecting constraints:
// - SL on Sam/Dim
// - Hardest quality mid-week (Mar-Jeu)
// - No 2× RPE≥6 adjacent
// - Day before/after SL: RPE ≤ 3
function assignToDays(sessions, slots, trainingDays) {
  const dayOffsets = { "Lun": 0, "Mar": 1, "Mer": 2, "Jeu": 3, "Ven": 4, "Sam": 5, "Dim": 6 };
  const QUALITY_TYPES = new Set(["SEUIL", "VMA", "TEMPO"]);

  const sortedDays = [...trainingDays].sort((a, b) => (dayOffsets[a] || 0) - (dayOffsets[b] || 0));
  const daySlots = sortedDays.map(d => ({ dayName: d, offset: dayOffsets[d] || 0, session: null, slot: null }));

  // Index sessions by role
  const slSessions = [];
  const qualitySessions = [];
  const easySessions = [];

  sessions.forEach((s, i) => {
    const slot = slots[i];
    if (s.type === "SL") slSessions.push({ session: s, slot });
    else if (QUALITY_TYPES.has(s.type)) qualitySessions.push({ session: s, slot });
    else easySessions.push({ session: s, slot });
  });

  // Sort quality sessions by RPE descending (hardest first for better placement)
  qualitySessions.sort((a, b) => (b.slot?.targetRPE || 0) - (a.slot?.targetRPE || 0));

  const weekendSlots = daySlots.filter(d => d.dayName === "Sam" || d.dayName === "Dim");
  const emptySlots = () => daySlots.filter(d => !d.session);

  // Place SL on weekend
  slSessions.forEach(({ session, slot }) => {
    const free = weekendSlots.find(d => !d.session);
    if (free) { free.session = session; free.slot = slot; }
    else {
      const fallback = [...daySlots].reverse().find(d => !d.session);
      if (fallback) { fallback.session = session; fallback.slot = slot; }
    }
  });

  // Place quality with spacing constraints
  const isAdjacentToHard = (testSlot) => {
    return daySlots.some(d => d.session && d.slot &&
      (d.slot.targetRPE >= 6 || d.session.type === "SL") &&
      Math.abs(d.offset - testSlot.offset) === 1
    );
  };

  qualitySessions.forEach(({ session, slot }) => {
    // Prefer mid-week slot not adjacent to hard/SL
    const midWeek = emptySlots().filter(d => d.offset >= 1 && d.offset <= 3 && !isAdjacentToHard(d));
    const safe = midWeek[0] || emptySlots().find(d => !isAdjacentToHard(d));
    if (safe) { safe.session = session; safe.slot = slot; }
    else {
      const fallback = emptySlots()[0];
      if (fallback) { fallback.session = session; fallback.slot = slot; }
    }
  });

  // Fill remaining with easy sessions
  easySessions.forEach(({ session, slot }) => {
    const s = emptySlots()[0];
    if (s) { s.session = session; s.slot = slot; }
  });

  return daySlots;
}

// ── Main generator (V2) ──────────────────────────────────────────────
export function generateWeeklyPlan(plan, availability, paces, startDate) {
  if (!plan || !plan.cycles || plan.cycles.length === 0) return [];

  const cycle = plan.cycles[0];
  const { volumeSchedule } = cycle;
  const distance = cycle.objective?.distance || "10km";
  const sessionsPerWeek = availability?.sessionsPerWeek || 4;
  const trainingDays = availability?.trainingDays || ["Mar", "Jeu", "Sam", "Dim"];

  const dayOffsets = { "Lun": 0, "Mar": 1, "Mer": 2, "Jeu": 3, "Ven": 4, "Sam": 5, "Dim": 6 };
  const baseDate = startDate || new Date();
  const phaseBoundaries = computePhaseBoundaries(volumeSchedule);

  const phaseObjectives = {
    "Base": "Focus endurance — construire le socle aérobie",
    "Construction": "Focus résistance — introduction de l'intensité",
    "Spécifique": "Focus allure cible — préparation à l'objectif",
    "Affûtage": "Focus fraîcheur — assimilation et récupération",
  };

  // Inter-week anti-repetition: track last used session ID per type
  const lastUsedByType = {};

  return volumeSchedule.map((weekData, idx) => {
    const { week, phase, volume, isAssim } = weekData;

    const pb = phaseBoundaries[phase] || { start: 0, total: 1 };
    const weekInPhase = idx - pb.start + 1;
    const totalWeeksInPhase = pb.total;
    const ratio = totalWeeksInPhase > 1 ? (weekInPhase - 1) / (totalWeeksInPhase - 1) : 0.5;

    const weekStartDate = new Date(baseDate);
    weekStartDate.setDate(weekStartDate.getDate() + (idx * 7));

    // ── Step 1: Build session slot descriptors ──
    const slots = buildSessionSlots(phase, ratio, sessionsPerWeek, isAssim, distance, volume);

    // ── Step 2: Resolve each slot to a concrete session ──
    // Build usedIds set: start with last week's sessions to avoid back-to-back repeats
    const usedIds = new Set();
    Object.values(lastUsedByType).forEach(id => { if (id) usedIds.add(id); });

    let sessions = slots.map(slot => {
      const targetKm = slot.volumePct > 0
        ? Math.round(volume * slot.volumePct)
        : Math.round(volume / sessionsPerWeek);
      return resolveSlot(slot, phase, ratio, paces, weekInPhase, totalWeeksInPhase, targetKm, usedIds);
    });

    // Update lastUsedByType for next week's anti-repetition
    sessions.forEach((s, i) => {
      if (s._sourceTemplateId && slots[i]) {
        lastUsedByType[slots[i].type] = s._sourceTemplateId;
      }
    });

    // ── Step 3: Distribute volume ──
    distributeVolume(sessions, slots, volume, distance);

    // ── Step 3b: Cap SL duration ──
    capSlDuration(sessions, slots, phase, distance, paces);

    // ── Step 3c: Recalculate durations after distance changes ──
    recalcDurations(sessions, slots, paces);

    // ── Step 4: Assign to days ──
    const daySlots = assignToDays(sessions, slots, trainingDays);

    // Build final session list with dates
    sessions = daySlots
      .filter(d => d.session)
      .map(d => {
        const sessionDate = new Date(weekStartDate);
        sessionDate.setDate(sessionDate.getDate() + d.offset);
        return {
          ...d.session,
          dayName: d.dayName,
          dayOffset: d.offset,
          date: sessionDate,
          dateFormatted: sessionDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        };
      });

    // Adjust for assimilation weeks
    if (isAssim) {
      sessions = sessions.map(s => ({
        ...s,
        distance: Math.round((typeof s.distance === 'number' ? s.distance : s.distance?.low || 0) * 0.75),
        notes: (s.notes || "") + " Semaine allégée : écoutez votre corps.",
      }));
    }

    // Convert session distances to ranges: base → base to base+1
    sessions = sessions.map(s => {
      const base = typeof s.distance === 'number' ? s.distance : (s.distance?.low || 0);
      return {
        ...s,
        distance: { low: Math.max(1, base), high: Math.max(1, base + 1) },
      };
    });

    // Weekly range
    const totalBase = sessions.reduce((sum, s) => sum + s.distance.low, 0);
    const weekSpread = Math.min(5, Math.round(totalBase * 0.1));
    const totalLow = totalBase;
    const totalHigh = totalBase + weekSpread;

    // Build full week with rest days
    const allDayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const trainingDayOffsets = new Set(sessions.map(s => s.dayOffset));
    const fullWeek = [];
    for (let d = 0; d < 7; d++) {
      if (trainingDayOffsets.has(d)) {
        fullWeek.push(...sessions.filter(s => s.dayOffset === d));
      } else {
        const restDate = new Date(weekStartDate);
        restDate.setDate(restDate.getDate() + d);
        fullWeek.push({
          isRest: true,
          dayName: allDayNames[d],
          dayOffset: d,
          date: restDate,
          dateFormatted: restDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
          title: "Repos",
          type: "REST",
        });
      }
    }

    return {
      week,
      phase,
      volume,
      isAssim,
      sessions: fullWeek,
      totalDistance: { low: totalLow, high: totalHigh },
      weekStartDate,
      weekEndDate: new Date(weekStartDate.getTime() + 6 * 86400000),
      objective: phaseObjectives[phase] || "",
    };
  });
}

// ── DB-ready plan generation ──────────────────────────────────────────

/**
 * Build structured steps from a legacy (hardcoded/fallback) session that
 * was NOT built from the session library. Converts warmup/main/cooldown
 * into step objects suitable for the session_steps DB table.
 */
function buildStepsFromLegacy(session, paces) {
  const steps = [];
  let sortOrder = 0;
  const easyPaceData = paces?.Easy;

  // Map session type to primary pace zone
  const typeToZone = {
    VMA: "VMACourte", SEUIL: "Seuil2", TEMPO: "Tempo",
    EF: "Easy", SL: "Easy", RECUP: "Easy",
  };
  const mainZone = typeToZone[session.type] || "Easy";
  const mainPaceData = paces?.[mainZone];

  // Warmup
  if (session.warmup && session.warmup.duration !== "—") {
    const minMatch = session.warmup.duration.match(/(\d+)/);
    steps.push({
      sortOrder: sortOrder++,
      stepType: "warmup",
      durationSec: minMatch ? parseInt(minMatch[1]) * 60 : null,
      paceZone: "Easy",
      paceMinSecKm: easyPaceData?.fast || null,
      paceMaxSecKm: easyPaceData?.slow || null,
      label: session.warmup.description || "Échauffement",
      description: `${session.warmup.duration} @ ${session.warmup.pace}`,
    });
  }

  // Main blocks
  if (session.main) {
    session.main.forEach(block => {
      steps.push({
        sortOrder: sortOrder++,
        stepType: "main",
        paceZone: mainZone,
        paceMinSecKm: mainPaceData?.fast || null,
        paceMaxSecKm: mainPaceData?.slow || null,
        label: block.description,
        description: `${block.duration} @ ${block.pace}`,
      });
    });
  }

  // Cooldown
  if (session.cooldown && session.cooldown.duration !== "—") {
    const minMatch = session.cooldown.duration.match(/(\d+)/);
    steps.push({
      sortOrder: sortOrder++,
      stepType: "cooldown",
      durationSec: minMatch ? parseInt(minMatch[1]) * 60 : null,
      paceZone: "Easy",
      paceMinSecKm: easyPaceData?.fast || null,
      paceMaxSecKm: easyPaceData?.slow || null,
      label: session.cooldown.description || "Retour au calme",
      description: `${session.cooldown.duration} @ ${session.cooldown.pace}`,
    });
  }

  return steps;
}

/**
 * Generate both the UI-ready weekly plan and DB-ready data for batch insertion.
 * Wraps generateWeeklyPlan() and transforms the output.
 *
 * @returns {{ weeklyPlan: Array, dbWeeks: Array }}
 */
export function generateAndPersistPlan(plan, availability, paces, startDate) {
  const weeklyPlan = generateWeeklyPlan(plan, availability, paces, startDate);

  const dbWeeks = weeklyPlan.map(weekData => ({
    weekNumber: weekData.week,
    phase: weekData.phase,
    targetVolume: weekData.volume,
    startDate: weekData.weekStartDate.toISOString().split('T')[0],
    isAssimilation: weekData.isAssim,
    sessions: weekData.sessions
      .filter(s => !s.isRest)
      .map((session, si) => {
        // Parse duration to minutes
        let durationMin = session._targetDurationMin || null;
        if (!durationMin && session.duration) {
          const hMatch = session.duration.match(/(\d+)h(\d+)/);
          const mMatch = session.duration.match(/(\d+)min/);
          const rangeMatch = session.duration.match(/(\d+)-(\d+)min/);
          if (hMatch) durationMin = parseInt(hMatch[1]) * 60 + parseInt(hMatch[2]);
          else if (rangeMatch) durationMin = (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
          else if (mMatch) durationMin = parseInt(mMatch[1]);
        }

        // Distance (before range conversion: use low value)
        const distKm = session._targetDistanceKm
          || (typeof session.distance === 'number' ? session.distance : session.distance?.low)
          || null;

        return {
          dayName: session.dayName,
          date: session.date.toISOString().split('T')[0],
          sortOrder: si,
          type: session.type,
          title: session.title,
          sourceTemplateId: session._sourceTemplateId || null,
          targetDurationMin: durationMin,
          targetDistanceKm: distKm,
          description: session.main?.map(b => b.description).join(' + ') || '',
          notes: session.notes || null,
          coachTips: session.coach_tips || [],
          rpe: session._rpe || null,
          steps: session._dbSteps || buildStepsFromLegacy(session, paces),
        };
      }),
  }));

  return { weeklyPlan, dbWeeks };
}

// Format distance range for display
export function fmtDist(d) {
  if (typeof d === "number") return `${d}`;
  if (d && d.low !== undefined) return d.low === d.high ? `${d.low}` : `${d.low}-${d.high}`;
  return "—";
}

// Get the midpoint of a distance (for proportional display)
export function distMid(d) {
  if (typeof d === "number") return d;
  if (d && d.low !== undefined) return (d.low + d.high) / 2;
  return 0;
}
