// ── Periodization Algorithm V2 ──────────────────────────────────────
// Phase allocation and volume schedule generation.
// V2: progressive growth clamp(×10%, 3, 10), plateau in Specific,
//     adaptive assimilation, tiered cap factors, TAPER_PROFILES.

import {
  ABSOLUTE_CAP, CEILING_GROWTH_RATE, DISTANCE_MIN_CEILING,
  SPECIFIC_MAX_WEEKS, CONSTRUCTION_PREREQ,
  VOLUME_CAP_FACTORS, TAPER_PROFILES,
} from '../data/constants';

// ── Unchanged from V1 ──────────────────────────────────────────────

export function computeStartingVolume(avg4w, lastWeek) {
  return (avg4w + lastWeek) / 2;
}

export function computeAnnualAvg(yearKm) {
  return yearKm / 52;
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// ── V2 cap factor (tiered, from constants) ─────────────────────────

export function getCapFactor(referenceVolume) {
  for (const { threshold, factor } of VOLUME_CAP_FACTORS) {
    if (referenceVolume < threshold) return factor;
  }
  // Should never reach here, but fallback
  return 0.20;
}

// ── Deprecated wrapper (backward compat) ───────────────────────────

export function computePhaseCap(referenceVolume) {
  const factor = getCapFactor(referenceVolume);
  return Math.min(referenceVolume * (1 + factor), ABSOLUTE_CAP);
}

// ── V2 global ceiling ──────────────────────────────────────────────

export function computeGlobalCeiling(annualAvg, distance) {
  const ref = Math.max(annualAvg, 20);
  const factor = getCapFactor(ref);
  let ceiling = ref * (1 + factor);
  if (distance && DISTANCE_MIN_CEILING[distance]) {
    ceiling = Math.max(ceiling, DISTANCE_MIN_CEILING[distance]);
  }
  return Math.min(ceiling, ABSOLUTE_CAP);
}

// ── V2 taper ───────────────────────────────────────────────────────

/**
 * Compute taper parameters from TAPER_PROFILES.
 * @param {string} distance - Race distance
 * @param {number} volumeCap - The volume cap reached in Construction
 * @returns {{ weeks: number, factors: number[] }}
 */
export function computeTaper(distance, volumeCap) {
  if (distance === "Marathon") {
    const key = volumeCap >= 80 ? "Marathon_high" : "Marathon_low";
    const factors = TAPER_PROFILES[key] || [0.70, 0.50];
    return { weeks: factors.length, factors };
  }
  const factors = TAPER_PROFILES[distance] || [0.75];
  return { weeks: factors.length, factors };
}

// ── V2 phase allocation ────────────────────────────────────────────

/**
 * Allocate training phases.
 * V2: 3rd param is annualAvg (was lastSpecificVolume in V1).
 * Assimilation: adaptive 3:1 (<50km volumeCap) or 4:1 (≥50km) in Base AND Construction.
 *
 * @param {number} totalWeeks
 * @param {string} distance
 * @param {number} annualAvg - Annual average weekly volume
 * @param {boolean} isFirstCycle
 * @param {number|null} planTotalWeeks
 * @returns {Object} Phase allocation
 */
export function allocatePhases(totalWeeks, distance, annualAvg, isFirstCycle = true, planTotalWeeks = null) {
  if (planTotalWeeks === null) planTotalWeeks = totalWeeks;

  const volumeCap = computeGlobalCeiling(annualAvg, distance);

  const result = {
    totalWeeks, distance,
    base: 0, construction: 0, specific: 0, taper: 0,
    taperType: "standard",
    baseAssimilations: [],
    constructionAssimilations: [],
    warnings: [],
    valid: true,
  };

  // Base weeks: 4 if plan≤12 or subsequent cycle, 6 if first cycle >12 weeks
  const baseWeeks = isFirstCycle ? (planTotalWeeks <= 12 ? 4 : 6) : 3;

  if (totalWeeks < 8) {
    result.valid = false;
    result.warnings.push(`Seulement ${totalWeeks} semaines disponibles. Minimum requis : 8 semaines.`);
    return result;
  }

  if (totalWeeks <= 10) {
    result.warnings.push(`Plan de ${totalWeeks} semaines : non optimal. 12 semaines recommandées.`);
  }

  // Taper allocation
  const { weeks: taperWeeks, factors: taperFactors } = computeTaper(distance, volumeCap);
  const maxSpecific = SPECIFIC_MAX_WEEKS[distance] || 4;

  const afterBase = totalWeeks - baseWeeks;
  const idealNeed = 4 + maxSpecific + taperWeeks; // min 4 construction + specific + taper

  let specificWeeks, actualTaper, constructionWeeks;

  if (afterBase >= idealNeed) {
    specificWeeks = maxSpecific;
    actualTaper = taperWeeks;
    constructionWeeks = afterBase - specificWeeks - actualTaper;
  } else {
    const availableForCs = afterBase - taperWeeks;
    if (availableForCs >= 4 + 1) {
      // Enough for min construction + at least 1 specific + taper
      specificWeeks = Math.min(availableForCs - 4, maxSpecific);
      actualTaper = taperWeeks;
      constructionWeeks = afterBase - specificWeeks - actualTaper;
    } else if (availableForCs >= 4) {
      constructionWeeks = afterBase;
      specificWeeks = 0;
      actualTaper = 0;
      result.warnings.push("Pas assez de temps pour la phase spécifique et l'affûtage.");
    } else {
      if (afterBase >= 5) {
        specificWeeks = Math.min(afterBase - 4, maxSpecific);
        constructionWeeks = afterBase - specificWeeks;
        actualTaper = 0;
        result.warnings.push("Pas assez de temps pour l'affûtage.");
      } else if (afterBase >= 2) {
        constructionWeeks = afterBase;
        specificWeeks = 0;
        actualTaper = 0;
        result.warnings.push("Pas assez de temps pour la phase spécifique et l'affûtage.");
      } else {
        constructionWeeks = afterBase;
        specificWeeks = 0;
        actualTaper = 0;
        result.warnings.push("Plan très compressé. Construction minimale uniquement.");
      }
    }
  }

  if (specificWeeks < 1) actualTaper = 0;

  result.base = baseWeeks;
  result.construction = constructionWeeks;
  result.specific = specificWeeks;
  result.taper = actualTaper;
  result.taperType = actualTaper > 0 ? "profile" : "none";

  // ── Assimilation scheduling ──
  // Adaptive: 3:1 pattern if volumeCap < 50, 4:1 if ≥ 50
  const assimCycle = volumeCap < 50 ? 3 : 4;

  // Base assimilations — only last week of base is assimilation.
  // Base is short (3-6 weeks) and focused on building volume, so we
  // don't interrupt with intermediate assimilations.
  if (baseWeeks > 0) {
    result.baseAssimilations = [baseWeeks];
  }

  // Construction assimilations
  if (constructionWeeks > 0) {
    const assimWeeks = [];
    let w = assimCycle;
    while (w < constructionWeeks) { assimWeeks.push(w); w += assimCycle; }
    // Last week of construction is always assimilation
    if (constructionWeeks > 0 && !assimWeeks.includes(constructionWeeks)) {
      assimWeeks.push(constructionWeeks);
    }
    // Avoid two assimilations too close together
    if (assimWeeks.length >= 2 && assimWeeks[assimWeeks.length - 1] - assimWeeks[assimWeeks.length - 2] <= 1) {
      assimWeeks.splice(assimWeeks.length - 2, 1);
    }
    result.constructionAssimilations = assimWeeks;
  }

  // Validation
  const totalAllocated = result.base + result.construction + result.specific + result.taper;
  if (totalAllocated !== totalWeeks) {
    result.warnings.push(`Allocation mismatch: ${totalAllocated} vs ${totalWeeks} semaines.`);
  }

  return result;
}

// ── V2 volume schedule ─────────────────────────────────────────────

/**
 * Generate weekly volume schedule.
 * V2 algorithm:
 * - Uniform increment: clamp(currentVol × 0.10, 3, 10)
 * - At ceiling: +3%/week max
 * - Base: climb towards annualAvg
 * - Construction: climb towards volumeCap
 * - Specific: PLATEAU at volumeCap
 * - Taper: apply TAPER_PROFILES factors sequentially
 * - Assimilation: ×0.75, then ramp 92% → peak → resume
 *
 * @param {Object} phases - From allocatePhases()
 * @param {number} startingVolume - Runner's current volume
 * @param {number} annualAvg - Annual average weekly volume
 * @param {number} avg4w - Last 4-week average
 * @returns {Array<{ week, phase, volume, isAssim }>}
 */
export function computeVolumeSchedule(phases, startingVolume, annualAvg, avg4w) {
  const schedule = [];
  let week = 1;
  let currentVol = startingVolume;

  const distance = phases.distance;
  const volumeCap = computeGlobalCeiling(annualAvg, distance);

  let preAssimVol = null;
  let rampState = 0; // 0=normal, 1=post-assim-1, 2=post-assim-2

  // ── Helper: compute increment ──
  function computeIncrement(vol, ceiling) {
    if (vol >= ceiling) {
      // At or above ceiling: drift at +3%
      return vol * CEILING_GROWTH_RATE;
    }
    return clamp(vol * 0.10, 3, 10);
  }

  // ── Helper: handle assimilation & ramp ──
  function handleWeek(vol, cap, isAssim) {
    if (isAssim) {
      preAssimVol = currentVol;
      vol = currentVol * 0.75;
      rampState = 1;
    } else if (rampState === 1) {
      // Week after assimilation: ramp back to pre-assimilation volume
      vol = preAssimVol * 0.95;
      vol = Math.min(vol, cap, ABSOLUTE_CAP);
      rampState = 2;
    } else if (rampState === 2) {
      // Second week: resume normal progression from pre-assimilation level
      vol = preAssimVol;
      vol = Math.min(vol, cap, ABSOLUTE_CAP);
      rampState = 0;
    } else {
      vol = Math.min(vol, cap, ABSOLUTE_CAP);
    }
    return vol;
  }

  // ── BASE ──
  // Base cap: climb towards an intermediate target between startingVolume and volumeCap.
  // When annualAvg ≈ startingVolume (runner at their usual level), Base must still
  // progress to set up Construction for reaching volumeCap.
  // baseCap = midpoint between max(annualAvg, startingVolume) and volumeCap
  const baseTarget = Math.max(annualAvg, startingVolume);
  const baseCap = Math.min(baseTarget + (volumeCap - baseTarget) * 0.5, volumeCap);

  const baseWeeks = phases.base;
  const baseAssimSet = new Set(phases.baseAssimilations || []);

  for (let i = 0; i < baseWeeks; i++) {
    const weekInPhase = i + 1;
    const isAssim = baseAssimSet.has(weekInPhase);
    let vol;

    if (isAssim || rampState > 0) {
      const inc = computeIncrement(currentVol, baseCap);
      vol = currentVol + inc;
      vol = handleWeek(vol, baseCap, isAssim);
    } else {
      const inc = computeIncrement(currentVol, baseCap);
      vol = currentVol + inc;
      vol = Math.min(vol, baseCap, ABSOLUTE_CAP);
    }

    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Base", volume: vol, isAssim });
    if (!isAssim) currentVol = vol;
    week++;
  }

  // ── CONSTRUCTION ──
  const constructionWeeks = phases.construction;
  const assimScheduleSet = new Set(phases.constructionAssimilations || []);

  for (let i = 0; i < constructionWeeks; i++) {
    const weekInPhase = i + 1;
    const isAssim = assimScheduleSet.has(weekInPhase);
    let vol;

    if (isAssim || rampState > 0) {
      const inc = computeIncrement(currentVol, volumeCap);
      vol = currentVol + inc;
      vol = handleWeek(vol, volumeCap, isAssim);
    } else {
      const inc = computeIncrement(currentVol, volumeCap);
      vol = currentVol + inc;
      vol = Math.min(vol, volumeCap, ABSOLUTE_CAP);
    }

    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Construction", volume: vol, isAssim });
    if (!isAssim) currentVol = vol;
    week++;
  }

  // ── SPECIFIC (PLATEAU) ──
  const specificWeeks = phases.specific;

  // Complete any post-assimilation ramp, then hold plateau
  for (let i = 0; i < specificWeeks; i++) {
    let vol;

    if (rampState === 1) {
      vol = preAssimVol * 0.92;
      vol = Math.min(vol, volumeCap, ABSOLUTE_CAP);
      rampState = 2;
    } else if (rampState === 2) {
      vol = preAssimVol;
      vol = Math.min(vol, volumeCap, ABSOLUTE_CAP);
      rampState = 0;
    } else {
      // Plateau: hold current volume, allow tiny drift +2-3%
      const drift = currentVol * 0.02;
      vol = Math.min(currentVol + drift, volumeCap, ABSOLUTE_CAP);
    }

    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Spécifique", volume: vol, isAssim: false });
    currentVol = vol;
    week++;
  }

  // ── TAPER ──
  const taperWeeks = phases.taper;
  // Get factors from profile
  const { factors: taperFactors } = computeTaper(distance, volumeCap);
  // Use the peak volume (before taper starts) as reference
  const peakVol = currentVol;

  for (let i = 0; i < taperWeeks; i++) {
    const factor = taperFactors[i] !== undefined ? taperFactors[i] : 0.70;
    let vol = peakVol * factor;
    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Affûtage", volume: vol, isAssim: false });
    currentVol = vol;
    week++;
  }

  return schedule;
}
