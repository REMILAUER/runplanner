// ── Periodization Algorithm ─────────────────────────────────────────
// Phase allocation and volume schedule generation.
// Extracted from App.jsx lines 82-388.

import {
  ABSOLUTE_CAP, CEILING_GROWTH_RATE, DISTANCE_MIN_CEILING,
  SPECIFIC_MAX_WEEKS, CONSTRUCTION_PREREQ,
} from '../data/constants';

export function computeStartingVolume(avg4w, lastWeek) {
  return (avg4w + lastWeek) / 2;
}

export function computeAnnualAvg(yearKm) {
  return yearKm / 52;
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getCapFactor(referenceVolume) {
  if (referenceVolume < 30) return 0.75;
  if (referenceVolume < 50) return 0.50;
  if (referenceVolume < 70) return 0.30;
  if (referenceVolume < 100) return 0.20;
  if (referenceVolume < 150) return 0.10;
  return 0.05;
}

export function computePhaseCap(referenceVolume) {
  const factor = getCapFactor(referenceVolume);
  return Math.min(referenceVolume * (1 + factor), ABSOLUTE_CAP);
}

export function computeGlobalCeiling(annualAvg, distance) {
  const factor = getCapFactor(annualAvg);
  let ceiling = annualAvg * (1 + factor);
  if (distance && DISTANCE_MIN_CEILING[distance]) {
    ceiling = Math.max(ceiling, DISTANCE_MIN_CEILING[distance]);
  }
  return Math.min(ceiling, ABSOLUTE_CAP);
}

export function computeTaper(distance, lastSpecificWeekVolume) {
  if (distance === "5km" || distance === "10km") return { weeks: 1, type: "standard" };
  if (distance === "Semi Marathon") {
    return lastSpecificWeekVolume < 60 ? { weeks: 1, type: "standard" } : { weeks: 1, type: "10days" };
  }
  if (distance === "Marathon") {
    return lastSpecificWeekVolume < 60 ? { weeks: 1, type: "10days" } : { weeks: 2, type: "standard" };
  }
  return { weeks: 1, type: "standard" };
}

export function allocatePhases(totalWeeks, distance, lastSpecificVolume, isFirstCycle = true, planTotalWeeks = null) {
  if (planTotalWeeks === null) planTotalWeeks = totalWeeks;

  const result = {
    totalWeeks, distance,
    base: 0, construction: 0, specific: 0, taper: 0,
    taperType: "standard",
    constructionAssimilations: [],
    warnings: [],
    valid: true,
  };

  const baseWeeks = isFirstCycle ? (planTotalWeeks <= 12 ? 4 : 6) : 4;

  if (totalWeeks < 8) {
    result.valid = false;
    result.warnings.push(`Seulement ${totalWeeks} semaines disponibles. Minimum requis : 8 semaines.`);
    return result;
  }

  if (totalWeeks <= 10) {
    result.warnings.push(`Plan de ${totalWeeks} semaines : non optimal. 12 semaines recommandées.`);
  }

  let remaining = totalWeeks;
  const { weeks: taperWeeks, type: taperType } = computeTaper(distance, lastSpecificVolume);
  const maxSpecific = SPECIFIC_MAX_WEEKS[distance] || 4;
  const minConstruction = CONSTRUCTION_PREREQ[distance] || 6;
  const afterBase = remaining - baseWeeks;
  const idealNeed = minConstruction + maxSpecific + taperWeeks;

  let specificWeeks, actualTaper, constructionWeeks;

  if (afterBase >= idealNeed) {
    specificWeeks = maxSpecific;
    actualTaper = taperWeeks;
    constructionWeeks = afterBase - specificWeeks - actualTaper;
  } else {
    const availableForCs = afterBase - taperWeeks;
    if (availableForCs >= minConstruction + 1) {
      constructionWeeks = minConstruction;
      specificWeeks = Math.min(availableForCs - minConstruction, maxSpecific);
      actualTaper = taperWeeks;
      constructionWeeks = afterBase - specificWeeks - actualTaper;
    } else if (availableForCs >= minConstruction) {
      constructionWeeks = afterBase;
      specificWeeks = 0;
      actualTaper = 0;
      result.warnings.push("Pas assez de temps pour la phase spécifique et l'affûtage.");
    } else {
      if (afterBase >= minConstruction + 1) {
        specificWeeks = Math.min(afterBase - minConstruction, maxSpecific);
        constructionWeeks = afterBase - specificWeeks;
        actualTaper = 0;
        result.warnings.push("Pas assez de temps pour l'affûtage.");
      } else if (afterBase >= 4) {
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
  result.taperType = actualTaper > 0 ? taperType : "none";

  if (constructionWeeks > 0) {
    const assimWeeks = [];
    let w = 5;
    while (w < constructionWeeks) { assimWeeks.push(w); w += 5; }
    if (!assimWeeks.includes(constructionWeeks)) assimWeeks.push(constructionWeeks);
    if (assimWeeks.length >= 2 && assimWeeks[assimWeeks.length - 1] - assimWeeks[assimWeeks.length - 2] <= 1) {
      assimWeeks.splice(assimWeeks.length - 2, 1);
    }
    result.constructionAssimilations = assimWeeks;
  }

  const totalAllocated = result.base + result.construction + result.specific + result.taper;
  if (totalAllocated !== totalWeeks) {
    result.warnings.push(`Allocation mismatch: ${totalAllocated} vs ${totalWeeks} semaines.`);
  }

  return result;
}

export function computeVolumeSchedule(phases, startingVolume, annualAvg, avg4w) {
  const schedule = [];
  let week = 1;
  let currentVol = startingVolume;

  const distance = phases.distance;
  const globalCeiling = computeGlobalCeiling(annualAvg, distance);

  // ── BASE ──
  const baseWeeks = phases.base;
  const baseCap = computePhaseCap(annualAvg);
  let preAssimVol = null;

  for (let i = 0; i < baseWeeks; i++) {
    const isAssim = (i === baseWeeks - 1);
    let vol;
    if (isAssim) {
      preAssimVol = currentVol;
      vol = currentVol * 0.75;
    } else {
      const aboveCeiling = currentVol >= globalCeiling;
      let increment;
      if (aboveCeiling) {
        increment = currentVol * CEILING_GROWTH_RATE;
      } else if (currentVol < annualAvg) {
        increment = currentVol * 0.20;
      } else {
        increment = currentVol * 0.10;
      }
      if (!aboveCeiling) {
        increment = clamp(increment, 5, 20);
      }
      vol = currentVol + increment;
      vol = Math.min(vol, baseCap, ABSOLUTE_CAP);
    }
    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Base", volume: vol, isAssim });
    if (!isAssim) currentVol = vol;
    week++;
  }

  // ── Transition Base → Construction ──
  const nonAssimBase = schedule.filter(s => s.phase === "Base" && !s.isAssim).map(s => s.volume);
  let baseAvgLast4;
  if (nonAssimBase.length >= 4) baseAvgLast4 = nonAssimBase.slice(-4).reduce((a, b) => a + b, 0) / 4;
  else if (nonAssimBase.length > 0) baseAvgLast4 = nonAssimBase.reduce((a, b) => a + b, 0) / nonAssimBase.length;
  else baseAvgLast4 = currentVol;

  // ── CONSTRUCTION ──
  const constructionWeeks = phases.construction;
  const assimScheduleSet = new Set(phases.constructionAssimilations || []);
  const constructionCap = computePhaseCap(baseAvgLast4);
  let assimilationsSeen = 0;
  let rampState = preAssimVol !== null ? 1 : 0;

  for (let i = 0; i < constructionWeeks; i++) {
    const weekInPhase = i + 1;
    const isAssim = assimScheduleSet.has(weekInPhase);
    let vol;

    if (isAssim) {
      preAssimVol = currentVol;
      vol = currentVol * 0.70;
      assimilationsSeen++;
      rampState = 1;
    } else if (rampState === 1) {
      vol = preAssimVol * 0.92;
      const effectiveCap = constructionCap + (assimilationsSeen * 2);
      vol = Math.min(vol, effectiveCap, ABSOLUTE_CAP);
      rampState = 2;
    } else if (rampState === 2) {
      vol = preAssimVol;
      const effectiveCap = constructionCap + (assimilationsSeen * 2);
      vol = Math.min(vol, effectiveCap, ABSOLUTE_CAP);
      rampState = 0;
    } else {
      const aboveCeiling = currentVol >= globalCeiling;
      let increment;
      if (aboveCeiling) {
        increment = currentVol * CEILING_GROWTH_RATE;
      } else {
        increment = currentVol * 0.10;
      }
      if (!aboveCeiling) {
        increment = clamp(increment, 5, 20);
      }
      vol = currentVol + increment;
      const effectiveCap = constructionCap + (assimilationsSeen * 2);
      vol = Math.min(vol, effectiveCap, ABSOLUTE_CAP);
    }

    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Construction", volume: vol, isAssim });
    if (!isAssim) currentVol = vol;
    week++;
  }

  // ── Transition Construction → Specific ──
  const nonAssimConst = schedule.filter(s => s.phase === "Construction" && !s.isAssim).map(s => s.volume);
  let constAvgLast4;
  if (nonAssimConst.length >= 4) constAvgLast4 = nonAssimConst.slice(-4).reduce((a, b) => a + b, 0) / 4;
  else if (nonAssimConst.length > 0) constAvgLast4 = nonAssimConst.reduce((a, b) => a + b, 0) / nonAssimConst.length;
  else constAvgLast4 = currentVol;

  // ── SPECIFIC ──
  const specificWeeks = phases.specific;
  const specificCap = computePhaseCap(constAvgLast4);

  for (let i = 0; i < specificWeeks; i++) {
    let vol;
    if (rampState === 1) {
      vol = preAssimVol * 0.92;
      vol = Math.min(vol, specificCap, ABSOLUTE_CAP);
      rampState = 2;
    } else if (rampState === 2) {
      vol = preAssimVol;
      vol = Math.min(vol, specificCap, ABSOLUTE_CAP);
      rampState = 0;
    } else {
      const aboveCeiling = currentVol >= globalCeiling;
      let increment;
      if (aboveCeiling) {
        increment = currentVol * CEILING_GROWTH_RATE;
      } else {
        increment = currentVol * 0.05;
      }
      if (!aboveCeiling) {
        increment = clamp(increment, 5, 10);
      }
      vol = currentVol + increment;
      vol = Math.min(vol, specificCap, ABSOLUTE_CAP);
    }
    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Spécifique", volume: vol, isAssim: false });
    currentVol = vol;
    week++;
  }

  // ── TAPER ──
  const taperWeeks = phases.taper;
  const taperFactor = currentVol > 100 ? 0.70 : 0.75;

  for (let i = 0; i < taperWeeks; i++) {
    let vol = currentVol * taperFactor;
    vol = Math.round(vol * 10) / 10;
    schedule.push({ week, phase: "Affûtage", volume: vol, isAssim: false });
    currentVol = vol;
    week++;
  }

  return schedule;
}
