// ── Week Hydrator ────────────────────────────────────────────────────
// Transforms raw Supabase DB rows (snake_case) into the UI-ready format
// expected by PlanScreen, SessionDetailModal, pdfExport, etc.

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAY_OFFSETS = { Lun: 0, Mar: 1, Mer: 2, Jeu: 3, Ven: 4, Sam: 5, Dim: 6 };

const PHASE_OBJECTIVES = {
  "Base": "Focus endurance — construire le socle aérobie",
  "Construction": "Focus résistance — introduction de l'intensité",
  "Spécifique": "Focus allure cible — préparation à l'objectif",
  "Affûtage": "Focus fraîcheur — assimilation et récupération",
};

// ── Main exports ─────────────────────────────────────────────────────

/**
 * Convert raw loadWeeksForCycle() output (snake_case DB rows) into
 * the UI format all components expect.
 */
export function hydrateWeeksFromDb(dbWeeks) {
  if (!dbWeeks || dbWeeks.length === 0) return [];

  return dbWeeks.map(dbWeek => {
    const weekStartDate = parseLocalDate(dbWeek.start_date);
    const weekEndDate = new Date(weekStartDate.getTime() + 6 * 86400000);
    const phase = dbWeek.phase;

    // Hydrate training sessions
    const trainingSessions = (dbWeek.sessions || []).map(dbSess => {
      const sessionDate = parseLocalDate(dbSess.date);
      const distKm = dbSess.target_distance_km != null ? Number(dbSess.target_distance_km) : 0;

      return {
        id: dbSess.id,
        isRest: false,
        dayName: dbSess.day_name,
        date: sessionDate,
        dateFormatted: sessionDate.toLocaleDateString("fr-FR", {
          weekday: "long", day: "numeric", month: "long",
        }),
        sortOrder: dbSess.sort_order,
        type: dbSess.type,
        title: dbSess.title,
        duration: formatDurationMin(dbSess.target_duration_min),
        distance: distKm,
        ...reconstructSessionDetail(dbSess.session_steps || []),
        _dbSteps: reconstructDbSteps(dbSess.session_steps || []),
        _rpe: dbSess.rpe || null,
        notes: dbSess.notes || dbSess.description || "",
        coach_tips: dbSess.coach_tips || [],
      };
    });

    // Fill rest days to make a 7-day week
    const trainingDayOffsets = new Set(
      trainingSessions.map(s => DAY_OFFSETS[s.dayName]).filter(d => d !== undefined)
    );
    const fullWeek = [];
    for (let d = 0; d < 7; d++) {
      const existing = trainingSessions.find(s => DAY_OFFSETS[s.dayName] === d);
      if (existing) {
        fullWeek.push(existing);
      } else {
        const restDate = new Date(weekStartDate);
        restDate.setDate(restDate.getDate() + d);
        fullWeek.push({
          isRest: true,
          dayName: DAY_NAMES[d],
          date: restDate,
          dateFormatted: restDate.toLocaleDateString("fr-FR", {
            weekday: "long", day: "numeric", month: "long",
          }),
          title: "Repos",
          type: "REST",
        });
      }
    }

    // Compute total distance
    const totalKm = trainingSessions.reduce((sum, s) => sum + (s.distance || 0), 0);
    const spread = Math.min(5, Math.round(totalKm * 0.1));

    return {
      week: dbWeek.week_number,
      phase,
      volume: Number(dbWeek.target_volume) || 0,
      isAssim: dbWeek.is_assimilation || false,
      sessions: fullWeek,
      totalDistance: { low: Math.round(totalKm), high: Math.round(totalKm + spread) },
      weekStartDate,
      weekEndDate,
      objective: PHASE_OBJECTIVES[phase] || "",
    };
  });
}

/**
 * Ensure all date fields are Date objects (not ISO strings).
 * Needed after localStorage JSON round-trip which serializes Dates to strings.
 */
export function ensureDates(weeklyPlan) {
  if (!weeklyPlan || !Array.isArray(weeklyPlan)) return weeklyPlan;
  return weeklyPlan.map(w => ({
    ...w,
    weekStartDate: toDate(w.weekStartDate),
    weekEndDate: toDate(w.weekEndDate),
    sessions: (w.sessions || []).map(s => ({
      ...s,
      date: toDate(s.date),
    })),
  }));
}

// ── Internal helpers ─────────────────────────────────────────────────

function toDate(val) {
  if (val instanceof Date) return val;
  if (typeof val === "string") return parseLocalDate(val);
  return new Date();
}

/**
 * Parse "2025-06-02" as a LOCAL date (not UTC).
 * new Date("2025-06-02") parses as UTC midnight, which can shift
 * to the previous day in negative-offset timezones.
 */
function parseLocalDate(isoStr) {
  if (!isoStr) return new Date();
  const parts = isoStr.split("T")[0].split("-");
  if (parts.length < 3) return new Date(isoStr);
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDurationMin(min) {
  if (!min && min !== 0) return "—";
  const m = Math.round(Number(min));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest > 0 ? `${h}h${String(rest).padStart(2, "0")}` : `${h}h`;
  }
  return `${m}min`;
}

function formatDurationSec(sec) {
  if (!sec) return "—";
  return formatDurationMin(Math.round(sec / 60));
}

function formatPaceRange(minSecKm, maxSecKm) {
  if (!minSecKm && !maxSecKm) return "—";
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const rest = Math.round(s % 60);
    return `${m}:${String(rest).padStart(2, "0")}`;
  };
  if (minSecKm && maxSecKm) return `${fmt(minSecKm)}-${fmt(maxSecKm)}`;
  return fmt(minSecKm || maxSecKm);
}

/**
 * Reconstruct the nested { warmup, main[], cooldown } structure
 * from a flat array of session_steps rows.
 */
function reconstructSessionDetail(steps) {
  const warmupSteps = steps.filter(s => s.step_type === "warmup");
  const mainSteps = steps.filter(s => s.step_type === "main");
  const cooldownSteps = steps.filter(s => s.step_type === "cooldown");

  const warmup = warmupSteps.length > 0
    ? {
        duration: formatDurationSec(warmupSteps[0].duration_sec),
        pace: formatPaceRange(warmupSteps[0].pace_min_sec_km, warmupSteps[0].pace_max_sec_km),
        description: warmupSteps[0].label || warmupSteps[0].description || "Échauffement",
      }
    : { duration: "—", pace: "—", description: "—" };

  const main = mainSteps.map(step => ({
    description: step.label || step.description || "",
    duration: formatStepDuration(step),
    pace: formatPaceRange(step.pace_min_sec_km, step.pace_max_sec_km),
  }));

  const cooldown = cooldownSteps.length > 0
    ? {
        duration: formatDurationSec(cooldownSteps[0].duration_sec),
        pace: formatPaceRange(cooldownSteps[0].pace_min_sec_km, cooldownSteps[0].pace_max_sec_km),
        description: cooldownSteps[0].label || cooldownSteps[0].description || "Retour au calme",
      }
    : { duration: "—", pace: "—", description: "—" };

  return {
    warmup,
    main: main.length > 0 ? main : [{ description: "—", duration: "—", pace: "—" }],
    cooldown,
  };
}

/**
 * Reconstruct _dbSteps array from DB session_steps rows.
 * Maps snake_case DB columns → camelCase fields expected by SessionDetailModal.
 */
function reconstructDbSteps(steps) {
  if (!steps || steps.length === 0) return [];
  return steps
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(s => ({
      sortOrder: s.sort_order || 0,
      stepType: s.step_type || "main",
      durationSec: s.duration_sec || null,
      distanceM: s.distance_m || null,
      reps: s.reps || null,
      sets: s.sets || null,
      paceZone: s.pace_zone || "Easy",
      paceMinSecKm: s.pace_min_sec_km || null,
      paceMaxSecKm: s.pace_max_sec_km || null,
      recoveryDurationSec: s.recovery_duration_sec || null,
      recoveryType: s.recovery_type || null,
      recoveryBetweenSetsSec: s.recovery_between_sets_sec || null,
      label: s.label || s.description || "",
      description: s.description || null,
    }));
}

/**
 * Format a main step's duration, considering reps, sets, distance, etc.
 */
function formatStepDuration(step) {
  const parts = [];

  if (step.sets && step.sets > 1) {
    parts.push(`${step.sets}×`);
  }
  if (step.reps && step.reps > 1) {
    if (step.distance_m) {
      parts.push(`${step.reps}×${step.distance_m}m`);
    } else if (step.duration_sec) {
      parts.push(`${step.reps}×${formatDurationSec(step.duration_sec)}`);
    } else {
      parts.push(`${step.reps} reps`);
    }
  } else if (step.distance_m) {
    parts.push(`${step.distance_m}m`);
  } else if (step.duration_sec) {
    parts.push(formatDurationSec(step.duration_sec));
  }

  if (step.recovery_duration_sec) {
    const recType = step.recovery_type || "récup";
    parts.push(`(r: ${formatDurationSec(step.recovery_duration_sec)} ${recType})`);
  }

  return parts.length > 0 ? parts.join(" ") : "—";
}
