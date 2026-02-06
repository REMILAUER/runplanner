// ── Plan Builder ────────────────────────────────────────────────────
// Orchestrates building training cycles from objectives.
// Extracted from App.jsx lines 390-501.

import { RECOVERY_DAYS, MIN_WEEKS_BEFORE_PRIO, MIN_WEEKS_BETWEEN_PRIO } from '../data/constants';
import { computeStartingVolume, computeAnnualAvg, allocatePhases, computeVolumeSchedule } from './periodization';

export function buildPlan(startDate, objectives, onboarding) {
  const prioObjectives = objectives
    .filter(o => o.type === "Prioritaire")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const startingVolume = computeStartingVolume(
    parseFloat(onboarding.avg4wKm) || 40,
    parseFloat(onboarding.lastWeekKm) || 40
  );
  const annualAvg = computeAnnualAvg(parseFloat(onboarding.yearKm) || 2000);

  const result = { cycles: [], warnings: [] };

  // ── No priority objectives → continuous ──
  if (prioObjectives.length === 0) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 24 * 7);
    const totalWeeks = Math.floor((endDate - startDate) / (7 * 86400000));

    const phases = allocatePhases(totalWeeks, "10km", 50, true, totalWeeks);
    phases.specific = 0;
    phases.taper = 0;
    phases.taperType = "none";
    phases.construction = totalWeeks - phases.base;

    const cw = phases.construction;
    const assim = [];
    let w = 5;
    while (w < cw) { assim.push(w); w += 5; }
    if (cw > 0 && !assim.includes(cw)) assim.push(cw);
    if (assim.length >= 2 && assim[assim.length - 1] - assim[assim.length - 2] <= 1) assim.splice(assim.length - 2, 1);
    phases.constructionAssimilations = assim;

    const volumeSchedule = computeVolumeSchedule(phases, startingVolume, annualAvg, parseFloat(onboarding.avg4wKm) || 40);

    result.cycles.push({
      objective: null,
      phases,
      volumeSchedule,
      startDate,
      type: "continuous",
    });
    result.warnings.push("Aucun objectif prioritaire. Plan en mode Base + Construction continue.");
    return result;
  }

  // ── Validate spacing ──
  let currentDate = new Date(startDate);

  for (let i = 0; i < prioObjectives.length; i++) {
    const objDate = new Date(prioObjectives[i].date);
    const weeksAvailable = Math.floor((objDate - currentDate) / (7 * 86400000));

    if (i === 0 && weeksAvailable < MIN_WEEKS_BEFORE_PRIO) {
      result.warnings.push(
        `Objectif ${prioObjectives[i].distance} : seulement ${weeksAvailable} semaines. Minimum requis : ${MIN_WEEKS_BEFORE_PRIO}.`
      );
    }

    if (i > 0) {
      const prevObj = prioObjectives[i - 1];
      const prevDate = new Date(prevObj.date);
      const recovDays = RECOVERY_DAYS[prevObj.distance] || 10;
      const recovEnd = new Date(prevDate);
      recovEnd.setDate(recovEnd.getDate() + recovDays);
      const weeksBetween = Math.floor((objDate - recovEnd) / (7 * 86400000));

      if (weeksBetween < MIN_WEEKS_BETWEEN_PRIO) {
        result.warnings.push(
          `${prevObj.distance} → ${prioObjectives[i].distance} : seulement ${weeksBetween} semaines après récup. Minimum : ${MIN_WEEKS_BETWEEN_PRIO}.`
        );
      }
    }
    currentDate = objDate;
  }

  // ── Build cycles ──
  let cycleStart = new Date(startDate);
  const totalPlanEnd = new Date(prioObjectives[prioObjectives.length - 1].date);
  const totalPlanWeeks = Math.floor((totalPlanEnd - new Date(startDate)) / (7 * 86400000));
  let currentStartingVolume = startingVolume;

  for (let i = 0; i < prioObjectives.length; i++) {
    const obj = prioObjectives[i];
    const objDate = new Date(obj.date);
    const cycleWeeks = Math.floor((objDate - cycleStart) / (7 * 86400000));
    const isFirst = (i === 0);
    const estimatedSpecificVol = currentStartingVolume * 1.4;

    const phases = allocatePhases(cycleWeeks, obj.distance, estimatedSpecificVol, isFirst, totalPlanWeeks);
    const volumeSchedule = computeVolumeSchedule(phases, currentStartingVolume, annualAvg, parseFloat(onboarding.avg4wKm) || 40);

    if (volumeSchedule.length > 0) {
      const lastVol = volumeSchedule[volumeSchedule.length - 1].volume;
      currentStartingVolume = lastVol * 0.7;
    }

    result.cycles.push({
      objective: obj,
      phases,
      volumeSchedule,
      startDate: new Date(cycleStart),
      type: "full_cycle",
    });

    const recovDays = RECOVERY_DAYS[obj.distance] || 10;
    cycleStart = new Date(objDate);
    cycleStart.setDate(cycleStart.getDate() + recovDays);
  }

  return result;
}
