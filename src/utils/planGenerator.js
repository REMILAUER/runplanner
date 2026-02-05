/**
 * Plan Generation Engine
 * Generates training cycles with periodization
 */

// Volume computation constants
const BASE_WEEKLY_KM = { "5km": 30, "10km": 35, "Semi Marathon": 45, "Marathon": 55 };
const VOL_INCREMENT_WEEK = { "5km": 3, "10km": 4, "Semi Marathon": 5, "Marathon": 6 };
const ASSIMILATION_INTERVAL = 3; // Every 3rd week is assimilation
const ASSIMILATION_FACTOR = 0.75;
const TAPER_START_WEEKS = { "5km": 1, "10km": 1, "Semi Marathon": 2, "Marathon": 3 };
const TAPER_FACTORS = [0.7, 0.5, 0.4];
const CONSTRUCTION_PREREQ = { "5km": 6, "10km": 6, "Semi Marathon": 6, "Marathon": 4 };

/**
 * Compute starting volume based on recent training
 */
export function computeStartingVolume(avg4w, lastWeek) {
  return (avg4w + lastWeek) / 2;
}

/**
 * Clamp value between min and max
 */
export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Build complete macrocycle plan
 */
export function buildMacroCycle(params) {
  const {
    objectives,
    startDate,
    currentVolume,
    volumeUnit = "km",
    sessionsPerWeek = 4,
    longRunDay = "Dim",
  } = params;

  // Sort objectives by date
  const sortedObjectives = [...objectives].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  const cycles = [];
  let cycleStartDate = new Date(startDate);

  for (const obj of sortedObjectives) {
    const raceDate = new Date(obj.date);
    const weeksToRace = Math.floor(
      (raceDate - cycleStartDate) / (7 * 24 * 60 * 60 * 1000)
    );

    if (weeksToRace < 4) continue; // Skip if not enough time

    const cycle = buildCycle({
      objective: obj,
      totalWeeks: weeksToRace,
      startingVolume: currentVolume,
      sessionsPerWeek,
    });

    cycles.push({
      objective: obj,
      startDate: new Date(cycleStartDate),
      endDate: raceDate,
      ...cycle,
    });

    // Next cycle starts after race + 1 week recovery
    cycleStartDate = new Date(raceDate);
    cycleStartDate.setDate(cycleStartDate.getDate() + 7);
  }

  return { cycles };
}

/**
 * Build single training cycle
 */
function buildCycle({ objective, totalWeeks, startingVolume, sessionsPerWeek }) {
  const distance = objective.distance;
  const isPriority = objective.type === "Prioritaire";

  // Phase distribution
  const taperWeeks = isPriority ? TAPER_START_WEEKS[distance] : 1;
  const specificWeeks = Math.max(2, Math.floor((totalWeeks - taperWeeks) * 0.3));
  const constructionWeeks = Math.max(2, Math.floor((totalWeeks - taperWeeks - specificWeeks) * 0.4));
  const baseWeeks = totalWeeks - taperWeeks - specificWeeks - constructionWeeks;

  // Volume targets
  const baseVolume = BASE_WEEKLY_KM[distance] || 35;
  const peakVolume = baseVolume * 1.4;
  const volumeIncrement = VOL_INCREMENT_WEEK[distance] || 4;

  // Build week schedule
  const volumeSchedule = [];
  let currentWeek = 1;
  let currentVolume = startingVolume || baseVolume * 0.8;

  // Base phase
  for (let i = 0; i < baseWeeks; i++) {
    const isAssim = (i + 1) % ASSIMILATION_INTERVAL === 0;
    const weekVolume = isAssim ? currentVolume * ASSIMILATION_FACTOR : currentVolume;
    
    volumeSchedule.push({
      week: currentWeek++,
      phase: "Base",
      volume: Math.round(weekVolume),
      isAssim,
    });

    if (!isAssim) {
      currentVolume = Math.min(currentVolume + volumeIncrement, peakVolume);
    }
  }

  // Construction phase
  for (let i = 0; i < constructionWeeks; i++) {
    const isAssim = (i + 1) % ASSIMILATION_INTERVAL === 0;
    const weekVolume = isAssim ? currentVolume * ASSIMILATION_FACTOR : currentVolume;
    
    volumeSchedule.push({
      week: currentWeek++,
      phase: "Construction",
      volume: Math.round(weekVolume),
      isAssim,
    });

    if (!isAssim) {
      currentVolume = Math.min(currentVolume + volumeIncrement * 0.5, peakVolume);
    }
  }

  // Specific phase
  for (let i = 0; i < specificWeeks; i++) {
    const isAssim = (i + 1) % ASSIMILATION_INTERVAL === 0;
    const weekVolume = isAssim ? currentVolume * ASSIMILATION_FACTOR : currentVolume;
    
    volumeSchedule.push({
      week: currentWeek++,
      phase: "Spécifique",
      volume: Math.round(weekVolume),
      isAssim,
    });
  }

  // Taper phase
  for (let i = 0; i < taperWeeks; i++) {
    const taperFactor = TAPER_FACTORS[i] || 0.5;
    volumeSchedule.push({
      week: currentWeek++,
      phase: "Affûtage",
      volume: Math.round(currentVolume * taperFactor),
      isAssim: false,
    });
  }

  return {
    totalWeeks,
    volumeSchedule,
    phases: {
      base: baseWeeks,
      construction: constructionWeeks,
      specific: specificWeeks,
      taper: taperWeeks,
    },
  };
}

/**
 * Get phase objectives text
 */
export function getPhaseObjective(phase) {
  const objectives = {
    Base: "Focus endurance — construire le socle aérobie",
    Construction: "Focus résistance — introduction de l'intensité",
    Spécifique: "Focus allure cible — préparation à l'objectif",
    Affûtage: "Focus fraîcheur — assimilation et récupération",
  };
  return objectives[phase] || "";
}
