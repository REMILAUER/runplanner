import { SESSION_LIBRARY } from '../data/sessionLibrary';

// ── Pace formatting helper ───────────────────────────────────────────

function fmtPace(secPerKm) {
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Format a pace range string from the paces object for a given zone.
 * Quality zones (Tempo, Seuil2, VMALongue, VMACourte) show fast-slow.
 * Easy zones show slow-fast.
 */
function getPaceStr(paces, zone) {
  if (!paces || !paces[zone]) return "—";
  const { slow, fast } = paces[zone];
  // For easy/recovery zones: slow first (higher pace = slower)
  if (zone === "Easy" || zone === "Actif") {
    return `${fmtPace(slow)}-${fmtPace(fast)}`;
  }
  // For quality zones: fast first (lower pace = faster)
  return `${fmtPace(fast)}-${fmtPace(slow)}`;
}

// ── Type mapping ─────────────────────────────────────────────────────

const TYPE_MAP = {
  VMA_COURTE: "VMA",
  VMA_LONGUE: "VMA",
  SEUIL2: "SEUIL",
  TEMPO: "TEMPO",
  SORTIE_LONGUE: "SL",
  FOOTING: "EF",
  SPECIFIQUE: "SEUIL",
  MOBILITE: "PPG",
};

// Map library session types to their primary pace zone
const PACE_ZONE_MAP = {
  VMA_COURTE: "VMACourte",
  VMA_LONGUE: "VMALongue",
  SEUIL2: "Seuil2",
  TEMPO: "Tempo",
  SORTIE_LONGUE: "Easy",
  FOOTING: "Easy",
  SPECIFIQUE: "Seuil2",
  MOBILITE: "Easy",
};

// ── selectSession ────────────────────────────────────────────────────

/**
 * Select a session from the library based on type, phase, and progression.
 * V2: library is now flat arrays sorted by RPE. We compute a target RPE
 * from the progression ratio and pick the closest session.
 *
 * @param {string} sessionType - Library key (VMA_COURTE, SEUIL2, etc.)
 * @param {string} phase - Training phase (Base, Construction, Spécifique, Affûtage)
 * @param {number} weekInPhase - Current week number within phase (1-based)
 * @param {number} totalWeeksInPhase - Total weeks in this phase
 * @returns {Object|null} - Library entry or null
 */
export function selectSession(sessionType, phase, weekInPhase, totalWeeksInPhase) {
  const available = SESSION_LIBRARY[sessionType];
  if (!available || !Array.isArray(available) || available.length === 0) return null;

  // Compute progression ratio → target RPE
  const ratio = totalWeeksInPhase > 0 ? weekInPhase / totalWeeksInPhase : 0.5;
  const minRPE = Math.min(...available.map(s => s.rpe));
  const maxRPE = Math.max(...available.map(s => s.rpe));
  const targetRPE = minRPE + ratio * (maxRPE - minRPE);

  // Find closest RPE
  let best = null;
  let bestDelta = Infinity;
  for (const entry of available) {
    const delta = Math.abs(entry.rpe - targetRPE);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = entry;
    }
  }

  return best;
}

// ── buildSessionFromLibrary ──────────────────────────────────────────

/**
 * Convert a library entry into a full session object compatible with
 * SessionDetailModal and PDF export.
 *
 * @param {Object} entry - Library entry from SESSION_LIBRARY
 * @param {number} targetDistanceKm - Target distance for this session
 * @param {Object} paces - Paces object from computeAllPaces()
 * @param {string} sessionTypeKey - Library key (VMA_COURTE, SEUIL2, etc.)
 * @returns {Object} - Session object { type, title, duration, distance, warmup, main, cooldown, notes, coach_tips }
 */
export function buildSessionFromLibrary(entry, targetDistanceKm, paces, sessionTypeKey) {
  const type = TYPE_MAP[sessionTypeKey] || "EF";
  const mainPaceZone = PACE_ZONE_MAP[sessionTypeKey] || "Easy";
  const easyPaceStr = getPaceStr(paces, "Easy");
  const mainPaceStr = getPaceStr(paces, mainPaceZone);

  // ── Helper: compute minutes from distance and pace zone ──
  function distToMin(km, zone) {
    const pd = paces[zone || "Easy"];
    if (!pd) return Math.round(km * 6); // fallback ~6min/km
    const mid = (pd.slow + pd.fast) / 2;
    return Math.round((km * mid) / 60);
  }

  function fmtMin(min) {
    if (min > 60) return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
    return `${min}min`;
  }

  // Build main blocks from library entry
  const mainBlocks = [];

  // ── SORTIE LONGUE ──
  if (sessionTypeKey === "SORTIE_LONGUE") {
    // V2 structure: { type: "segments", segments: [{ fraction, pace_zone }] }
    const s = entry.structure;
    if (s && s.type === "segments" && Array.isArray(s.segments)) {
      s.segments.forEach((seg) => {
        const zone = seg.pace_zone || "Easy";
        const pct = seg.fraction || 0;
        const km = Math.round(targetDistanceKm * pct * 10) / 10;
        const min = distToMin(km, zone);
        mainBlocks.push({
          description: `${Math.round(pct * 100)}% en ${zone.toLowerCase()} (~${km}km)`,
          duration: `~${fmtMin(min)}`,
          pace: getPaceStr(paces, zone),
        });
      });
    } else if (s && s.type === "duration_blocks" && Array.isArray(s.blocks)) {
      // V2: fixed duration blocks in minutes { duration_min, pace_zone }
      s.blocks.forEach((block) => {
        const zone = block.pace_zone || "Easy";
        mainBlocks.push({
          description: `${block.duration_min}min en ${zone.toLowerCase()}`,
          duration: fmtMin(block.duration_min),
          pace: getPaceStr(paces, zone),
        });
      });
    } else {
      // Fallback: simple SL
      const primaryZone = (entry.zones && entry.zones[0]) || "Easy";
      const totalMin = distToMin(targetDistanceKm, primaryZone);
      mainBlocks.push({
        description: entry.description,
        duration: fmtMin(totalMin),
        pace: getPaceStr(paces, primaryZone),
      });
    }
  }
  // ── FOOTING ──
  else if (sessionTypeKey === "FOOTING") {
    const totalMin = distToMin(targetDistanceKm, "Easy");

    if (entry.structure && typeof entry.structure === "string") {
      // Structured footing (rappels VMA, etc.)
      mainBlocks.push({
        description: entry.structure,
        duration: fmtMin(totalMin),
        pace: easyPaceStr,
      });
    } else {
      // Simple footing
      mainBlocks.push({
        description: entry.description,
        duration: fmtMin(totalMin),
        pace: easyPaceStr,
      });
    }

    if (entry.gammes_detail) {
      mainBlocks.push({
        description: `Gammes : ${entry.gammes_detail}`,
        duration: "10min",
        pace: "—",
      });
    }
    if (entry.accelerations) {
      mainBlocks.push({
        description: `Accélérations : ${entry.accelerations}`,
        duration: "5min",
        pace: "Progressif",
      });
    }
  }
  // ── INTERVAL SESSIONS (VMA, SEUIL, TEMPO) ──
  else {
    mainBlocks.push({
      description: entry.description,
      duration: buildDurationStr(entry),
      pace: mainPaceStr,
    });

    if (entry.recovery_desc && entry.recovery_desc !== "—") {
      mainBlocks.push({
        description: `Récupération : ${entry.recovery_desc}`,
        duration: "—",
        pace: easyPaceStr,
      });
    }
  }

  // Compute warmup/cooldown based on session type
  const isEasySession = type === "EF" || type === "SL" || type === "RECUP";
  const hasWarmup = !isEasySession || entry.includes;

  const warmup = hasWarmup
    ? { duration: "15min", pace: easyPaceStr, description: "Footing progressif + gammes" }
    : { duration: "—", pace: "—", description: "—" };

  const cooldown = hasWarmup
    ? { duration: "10min", pace: easyPaceStr, description: "Retour au calme" }
    : { duration: "5min", pace: easyPaceStr, description: "Marche + étirements" };

  // Compute total duration estimate
  const warmupMin = hasWarmup ? 15 : 0;
  const cooldownMin = hasWarmup ? 10 : 5;
  const mainMin = estimateMainDuration(entry, targetDistanceKm, paces, sessionTypeKey);
  const totalMin = warmupMin + mainMin + cooldownMin;
  const totalRounded = Math.round(totalMin);
  const durationStr = totalRounded > 60
    ? `${Math.floor(totalRounded / 60)}h${String(totalRounded % 60).padStart(2, "0")}`
    : `${totalRounded}min`;

  // ── Build structured steps for DB persistence ──
  const _dbSteps = [];
  let stepOrder = 0;

  // Warmup step
  if (hasWarmup) {
    _dbSteps.push({
      sortOrder: stepOrder++,
      stepType: "warmup",
      durationSec: warmupMin * 60,
      paceZone: "Easy",
      paceMinSecKm: paces?.Easy?.fast || null,
      paceMaxSecKm: paces?.Easy?.slow || null,
      label: warmup.description,
      description: `${warmup.duration} @ ${warmup.pace}`,
    });
  }

  // Main steps — from library entry structure
  const mainPaceData = paces?.[mainPaceZone];
  const easyPaceData = paces?.Easy;
  const s = entry.structure;

  if (s) {
    // Time-based intervals (30/30 etc.)
    if (s.type === "time_based" && s.reps && s.work_sec) {
      _dbSteps.push({
        sortOrder: stepOrder++,
        stepType: "main",
        reps: s.reps,
        durationSec: s.work_sec,
        paceZone: mainPaceZone,
        paceMinSecKm: mainPaceData?.fast || null,
        paceMaxSecKm: mainPaceData?.slow || null,
        recoveryDurationSec: s.recovery_sec || s.work_sec,
        recoveryType: s.recovery_type || "jog",
        label: entry.description,
        description: entry.recovery_desc || null,
      });
    }
    // Sets format (2 × (6 × 300m))
    else if (s.sets && s.reps_per_set) {
      _dbSteps.push({
        sortOrder: stepOrder++,
        stepType: "main",
        reps: s.reps_per_set,
        sets: s.sets,
        durationSec: s.duration_sec || null,
        distanceM: s.distance_m || null,
        paceZone: mainPaceZone,
        paceMinSecKm: mainPaceData?.fast || null,
        paceMaxSecKm: mainPaceData?.slow || null,
        recoveryDurationSec: s.recovery_intra_sec || 60,
        recoveryType: s.recovery_type || "jog",
        recoveryBetweenSetsSec: s.recovery_inter_sec || 180,
        label: entry.description,
        description: entry.recovery_desc || null,
      });
    }
    // Pyramid
    else if ((s.type === "pyramid" && s.segments) || s.segments_sec) {
      const segments = s.segments || s.segments_sec;
      _dbSteps.push({
        sortOrder: stepOrder++,
        stepType: "main",
        reps: segments.length,
        durationSec: s.segments_sec ? s.segments_sec.reduce((a, b) => a + b, 0) : null,
        paceZone: mainPaceZone,
        paceMinSecKm: mainPaceData?.fast || null,
        paceMaxSecKm: mainPaceData?.slow || null,
        recoveryDurationSec: s.recovery_sec || 120,
        recoveryType: s.recovery_type || "jog",
        label: entry.description,
        description: `Pyramid: ${segments.join('-')}${s.segments ? 'm' : 's'}. ${entry.recovery_desc || ''}`,
      });
    }
    // Mixed format (V2: segments may have pace_zone per segment)
    else if (s.type === "mixed" && s.segments) {
      s.segments.forEach((seg, i) => {
        const segZone = seg.pace_zone || mainPaceZone;
        const segPaceData = paces?.[segZone];
        _dbSteps.push({
          sortOrder: stepOrder++,
          stepType: "main",
          distanceM: seg.distance_m || null,
          durationSec: seg.duration_sec || null,
          paceZone: segZone,
          paceMinSecKm: segPaceData?.fast || mainPaceData?.fast || null,
          paceMaxSecKm: segPaceData?.slow || mainPaceData?.slow || null,
          recoveryDurationSec: seg.recovery_sec || null,
          recoveryType: s.recovery_type || "jog",
          label: `Segment ${i + 1}`,
          description: seg.description || null,
        });
      });
    }
    // Simple reps (10 × 400m, 3 × 10min, etc.)
    else if (s.reps) {
      _dbSteps.push({
        sortOrder: stepOrder++,
        stepType: "main",
        reps: s.reps,
        durationSec: s.duration_sec || s.work_sec || null,
        distanceM: s.distance_m || null,
        paceZone: mainPaceZone,
        paceMinSecKm: mainPaceData?.fast || null,
        paceMaxSecKm: mainPaceData?.slow || null,
        recoveryDurationSec: s.recovery_sec || 60,
        recoveryType: s.recovery_type || "jog",
        label: entry.description,
        description: entry.recovery_desc || null,
      });
    }
  }

  // For SL/FOOTING with multiple zones but no structured intervals
  if (_dbSteps.filter(st => st.stepType === "main").length === 0) {
    mainBlocks.forEach((block, i) => {
      _dbSteps.push({
        sortOrder: stepOrder++,
        stepType: "main",
        paceZone: mainPaceZone,
        paceMinSecKm: mainPaceData?.fast || null,
        paceMaxSecKm: mainPaceData?.slow || null,
        label: block.description,
        description: `${block.duration} @ ${block.pace}`,
      });
    });
  }

  // Cooldown step
  _dbSteps.push({
    sortOrder: stepOrder++,
    stepType: "cooldown",
    durationSec: cooldownMin * 60,
    paceZone: "Easy",
    paceMinSecKm: easyPaceData?.fast || null,
    paceMaxSecKm: easyPaceData?.slow || null,
    label: cooldown.description,
    description: `${cooldown.duration} @ ${cooldown.pace}`,
  });

  return {
    type,
    title: entry.name,
    duration: durationStr,
    distance: Math.round(targetDistanceKm),
    warmup,
    main: mainBlocks,
    cooldown,
    notes: entry.notes || "",
    coach_tips: entry.coach_tips || [],
    _dbSteps,
    _sourceTemplateId: entry.id || null,
    _targetDurationMin: totalRounded,
    _targetDistanceKm: targetDistanceKm,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildDurationStr(entry) {
  const s = entry.structure;
  if (!s) return "—";

  // Time-based intervals (30/30, etc.) — check first since it also has reps
  if (s.type === "time_based" && s.reps && s.work_sec) {
    const effort = s.reps * s.work_sec;
    const recov = (s.reps - 1) * (s.recovery_sec || s.work_sec);
    return `${Math.round((effort + recov) / 60)}min`;
  }

  // Sets format (2 × (6 × 300m))
  if (s.sets && s.reps_per_set && s.duration_sec) {
    const totalReps = s.sets * s.reps_per_set;
    const effort = totalReps * s.duration_sec;
    const intra = (s.reps_per_set - 1) * (s.recovery_intra_sec || 60) * s.sets;
    const inter = (s.sets - 1) * (s.recovery_inter_sec || 180);
    return `${Math.round((effort + intra + inter) / 60)}min`;
  }

  // Simple reps (10 × 400m, 3 × 10min, etc.)
  if (s.reps && (s.duration_sec || s.work_sec)) {
    const dur = s.duration_sec || s.work_sec;
    const effort = s.reps * dur;
    const recov = (s.reps - 1) * (s.recovery_sec || 60);
    return `${Math.round((effort + recov) / 60)}min`;
  }

  // Pyramid with distances
  if (s.type === "pyramid" && s.segments) {
    return `${s.segments.length} fractions`;
  }

  // Pyramid with time segments
  if (s.segments_sec) {
    const effort = s.segments_sec.reduce((a, b) => a + b, 0);
    const recov = (s.segments_sec.length - 1) * (s.recovery_sec || 120);
    return `${Math.round((effort + recov) / 60)}min`;
  }

  // Mixed format (V2: segments have duration_sec)
  if (s.type === "mixed" && s.segments) {
    let total = 0;
    for (const seg of s.segments) {
      total += seg.duration_sec || 0;
      total += seg.recovery_sec || 0;
    }
    if (total > 0) return `${Math.round(total / 60)}min`;
    return `${s.segments.length} fractions`;
  }

  return "—";
}

// ── RPE-based session selection (V2 native) ────────────────────────────

/**
 * Select a session from the library by RPE proximity.
 * V2: library is now flat arrays with native RPE field on each session.
 *
 * Features:
 * - Anti-repetition: excludes sessions whose IDs are in `usedIds`
 * - targetRace filter: for SPECIFIQUE sessions, filters by `target_race` field
 * - Random pick among equal-RPE candidates for variety
 *
 * @param {string} sessionType - Library key (VMA_COURTE, SEUIL2, etc.)
 * @param {string} phase - Training phase (unused in V2, kept for backward compat)
 * @param {number} targetRPE - Desired RPE (1-10)
 * @param {Set} usedIds - Set of session IDs already used (for anti-repetition)
 * @param {string|null} targetRace - Filter SPECIFIQUE sessions by target_race (e.g. "semi")
 * @returns {Object|null} - Library entry or null
 */
export function selectSessionByRPE(sessionType, phase, targetRPE, usedIds = new Set(), targetRace = null) {
  let available = SESSION_LIBRARY[sessionType];
  if (!available || !Array.isArray(available) || available.length === 0) return null;

  // Filter by target_race if specified (for SPECIFIQUE category)
  if (targetRace) {
    const filtered = available.filter(e => e.target_race === targetRace);
    if (filtered.length > 0) available = filtered;
  }

  // Sort candidates by RPE distance to target
  const scored = available.map(entry => ({
    entry,
    delta: Math.abs((entry.rpe || 5) - targetRPE),
    used: usedIds.has(entry.id),
  }));
  scored.sort((a, b) => a.delta - b.delta);

  // Try to pick an unused session first
  const bestDelta = scored[0].delta;

  // Candidates at the best RPE delta that are NOT already used
  const freshAtBest = scored.filter(s => s.delta === bestDelta && !s.used);
  if (freshAtBest.length > 0) {
    return freshAtBest[Math.floor(Math.random() * freshAtBest.length)].entry;
  }

  // All at best delta are used — try next-closest RPE deltas (unused)
  const freshAny = scored.filter(s => !s.used);
  if (freshAny.length > 0) {
    return freshAny[0].entry; // closest unused RPE
  }

  // Everything used — fall back to random among best delta (allow repeat)
  const atBest = scored.filter(s => s.delta === bestDelta);
  return atBest[Math.floor(Math.random() * atBest.length)].entry;
}

// ── Helpers ──────────────────────────────────────────────────────────

function estimateMainDuration(entry, targetDistanceKm, paces, sessionTypeKey) {
  const s = entry.structure;

  // ── Distance-based estimate (SL, FOOTING, or any session without structured intervals) ──
  // Use targetDistanceKm × average pace when we know the distance
  if (targetDistanceKm && paces) {
    const isDistanceBased = sessionTypeKey === "SORTIE_LONGUE" || sessionTypeKey === "FOOTING";
    const hasStructuredIntervals = s && (s.reps || s.sets || (s.segments && s.type !== "segments"));

    if (isDistanceBased || !hasStructuredIntervals) {
      let avgPaceSec = 0;

      // V2: SL uses structure.segments with {fraction, pace_zone}
      if (s && s.type === "segments" && Array.isArray(s.segments)) {
        s.segments.forEach((seg) => {
          const paceData = paces[seg.pace_zone || "Easy"];
          if (paceData) {
            avgPaceSec += ((paceData.slow + paceData.fast) / 2) * (seg.fraction || 0);
          }
        });
      }
      // V2: SL duration_blocks — sum fixed durations, return directly
      else if (s && s.type === "duration_blocks" && Array.isArray(s.blocks)) {
        return s.blocks.reduce((sum, b) => sum + (b.duration_min || 0), 0);
      }
      // Fallback: use entry.zones or entry.pace_zones (backward compat)
      else {
        const zones = entry.pace_zones || entry.zones || ["Easy"];
        const distribution = entry.distribution || zones.map(() => 1 / zones.length);
        zones.forEach((zone, i) => {
          const paceData = paces[zone];
          if (paceData) {
            const midPace = (paceData.slow + paceData.fast) / 2;
            avgPaceSec += midPace * (distribution[i] || 0);
          }
        });
      }

      // Fallback if pace couldn't be computed
      if (avgPaceSec <= 0 && paces.Easy) {
        avgPaceSec = (paces.Easy.slow + paces.Easy.fast) / 2;
      }
      if (avgPaceSec > 0) {
        return (targetDistanceKm * avgPaceSec) / 60;
      }
    }
  }

  if (!s) return 30; // default 30min

  // ── Structured interval sessions ──

  // Time-based (30/30 etc.) — check first since it also has reps
  if (s.type === "time_based" && s.reps) {
    const effort = s.reps * (s.work_sec || 30);
    const recov = (s.reps - 1) * (s.recovery_sec || 30);
    return (effort + recov) / 60;
  }

  // Sets format (2 × (6 × 300m))
  if (s.sets && s.reps_per_set && s.duration_sec) {
    const totalReps = s.sets * s.reps_per_set;
    const effort = totalReps * s.duration_sec;
    const intra = (s.reps_per_set - 1) * (s.recovery_intra_sec || 60) * s.sets;
    const inter = (s.sets - 1) * (s.recovery_inter_sec || 180);
    return (effort + intra + inter) / 60;
  }

  // Pyramid with distances
  if (s.type === "pyramid" && s.segments) {
    const effort = s.segments.reduce((sum, d) => sum + d / 100 * 18, 0);
    const recov = s.segments.reduce((sum, d) => sum + d / 100 * 18 * (s.recovery_ratio || 1.0), 0);
    return (effort + recov) / 60;
  }

  // Mixed format (V2: segments have duration_sec and/or distance_m)
  if (s.type === "mixed" && s.segments) {
    let effort = 0;
    let recov = 0;
    for (const seg of s.segments) {
      if (seg.duration_sec) {
        effort += seg.duration_sec;
      } else if (seg.distance_m) {
        effort += (seg.distance_m / 100) * 18; // rough ~18s per 100m
      }
      recov += seg.recovery_sec || 0;
    }
    return (effort + recov) / 60;
  }

  // Pyramid with time segments
  if (s.segments_sec) {
    const effort = s.segments_sec.reduce((a, b) => a + b, 0);
    const recov = (s.segments_sec.length - 1) * (s.recovery_sec || 120);
    return (effort + recov) / 60;
  }

  // Continuous effort (reps=1, no recovery)
  if (s.reps === 1 && s.duration_sec) {
    return s.duration_sec / 60;
  }

  // Simple reps: effort + recovery (generic fallback for reps > 1)
  if (s.reps && s.reps > 1 && s.duration_sec) {
    const effort = s.reps * s.duration_sec;
    const recov = (s.reps - 1) * (s.recovery_sec || 60);
    return (effort + recov) / 60;
  }

  return 30;
}
