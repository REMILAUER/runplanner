import { useState, useRef, useEffect, useMemo } from "react";
import { selectSession, buildSessionFromLibrary } from './utils/sessionLibraryUtils';

// Note: This is a monolithic file that can be refactored into smaller modules.
// See the /utils and /data folders for extracted utilities.
// The modular versions are available but this file works as-is.

const DEFAULT_TIMES = {
  "1500": "4:30",
  "3000": "10:00",
  "5km": "20:00",
  "10km": "40:00",
  "Semi Marathon": "1:30:00",
  "Marathon": "3:00:00",
};

const DISTANCE_METERS = {
  "1500": 1500,
  "3000": 3000,
  "5km": 5000,
  "10km": 10000,
  "Semi Marathon": 21097,
  "Marathon": 42195,
};

const OBJECTIVE_DISTANCES = ["5km", "10km", "Semi Marathon", "Marathon"];
const ALL_DISTANCES = ["1500", "3000", ...OBJECTIVE_DISTANCES];
const DAYS_LIST = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const OBJ_TYPES = ["Prioritaire", "Secondaire", "Annexe"];
const FONT = `'IBM Plex Mono', 'Courier New', monospace`;

// ── VDOT + Pace Engine ──────────────────────────────────────────────

function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function computeVDOT(distanceM, timeSec) {
  const tMin = timeSec / 60;
  const V = distanceM / tMin;
  const VO2 = -4.6 + 0.182258 * V + 0.000104 * V * V;
  const pct =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMin) +
    0.2989558 * Math.exp(-0.1932605 * tMin);
  return VO2 / pct;
}

function paceFromFraction(vdot, fraction) {
  const target = fraction * vdot;
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - target;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 600;
  const V = (-b + Math.sqrt(disc)) / (2 * a);
  if (V <= 0) return 600;
  return Math.round(60000 / V);
}

function computeAllPaces(vdot) {
  return {
    Easy:       { slow: paceFromFraction(vdot, 0.45), fast: paceFromFraction(vdot, 0.60), label: "Easy",       desc: "Footing, échauffement, récupération, retour au calme" },
    Actif:      { slow: paceFromFraction(vdot, 0.60), fast: paceFromFraction(vdot, 0.70), label: "Actif",      desc: "Footings et sorties longues : pas en entier, par portions" },
    Seuil1:     { slow: paceFromFraction(vdot, 0.70), fast: paceFromFraction(vdot, 0.75), label: "Seuil 1",    desc: "Blocs qualitatifs très longs : généralement 20 à 40 min" },
    Tempo:      { slow: paceFromFraction(vdot, 0.75), fast: paceFromFraction(vdot, 0.85), label: "Tempo",      desc: "Blocs qualitatifs longs : généralement 6 à 20 min" },
    Seuil2:     { slow: paceFromFraction(vdot, 0.85), fast: paceFromFraction(vdot, 0.90), label: "Seuil 2",    desc: "Blocs rapides longs : généralement 4 à 12 min" },
    VMALongue:  { slow: paceFromFraction(vdot, 0.90), fast: paceFromFraction(vdot, 0.95), label: "VMA longue", desc: "Allures 10-5km : intervalles moyens de 1 à 6 min (400-1200m)" },
    VMACourte:  { slow: paceFromFraction(vdot, 0.95), fast: paceFromFraction(vdot, 1.00), label: "VMA courte", desc: "Allures 1500-3000 : intervalles courts (<400m), côtes, vitesse" },
  };
}

function formatPace(secPerKm) {
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// ── Periodization Algorithm (ported from Python v2) ─────────────────

const RECOVERY_DAYS = { "5km": 7, "10km": 7, "Semi Marathon": 10, "Marathon": 14 };
const SPECIFIC_MAX_WEEKS = { "5km": 4, "10km": 4, "Semi Marathon": 4, "Marathon": 6 };
const CONSTRUCTION_PREREQ = { "5km": 6, "10km": 6, "Semi Marathon": 6, "Marathon": 4 };
const MIN_WEEKS_BEFORE_PRIO = 8;
const MIN_WEEKS_BETWEEN_PRIO = 8;
const ABSOLUTE_CAP = 210;
const CEILING_GROWTH_RATE = 0.03; // +3%/week once global ceiling is reached

const DISTANCE_MIN_CEILING = { "5km": 40, "10km": 40, "Semi Marathon": 50, "Marathon": 65 };

function computeStartingVolume(avg4w, lastWeek) {
  return (avg4w + lastWeek) / 2;
}

function computeAnnualAvg(yearKm) {
  return yearKm / 52;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getCapFactor(referenceVolume) {
  if (referenceVolume < 30) return 0.75;
  if (referenceVolume < 50) return 0.50;
  if (referenceVolume < 70) return 0.30;
  if (referenceVolume < 100) return 0.20;
  if (referenceVolume < 150) return 0.10;
  return 0.05;
}

function computePhaseCap(referenceVolume) {
  const factor = getCapFactor(referenceVolume);
  return Math.min(referenceVolume * (1 + factor), ABSOLUTE_CAP);
}

function computeGlobalCeiling(annualAvg, distance) {
  const factor = getCapFactor(annualAvg);
  let ceiling = annualAvg * (1 + factor);
  if (distance && DISTANCE_MIN_CEILING[distance]) {
    ceiling = Math.max(ceiling, DISTANCE_MIN_CEILING[distance]);
  }
  return Math.min(ceiling, ABSOLUTE_CAP);
}

function computeTaper(distance, lastSpecificWeekVolume) {
  if (distance === "5km" || distance === "10km") return { weeks: 1, type: "standard" };
  if (distance === "Semi Marathon") {
    return lastSpecificWeekVolume < 60 ? { weeks: 1, type: "standard" } : { weeks: 1, type: "10days" };
  }
  if (distance === "Marathon") {
    return lastSpecificWeekVolume < 60 ? { weeks: 1, type: "10days" } : { weeks: 2, type: "standard" };
  }
  return { weeks: 1, type: "standard" };
}

function allocatePhases(totalWeeks, distance, lastSpecificVolume, isFirstCycle = true, planTotalWeeks = null) {
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

function computeVolumeSchedule(phases, startingVolume, annualAvg, avg4w) {
  const schedule = [];
  let week = 1;
  let currentVol = startingVolume;

  // Global ceiling: once volume reaches this, progression slows to CEILING_GROWTH_RATE
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

function buildPlan(startDate, objectives, onboarding) {
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

// ── Shared components ───────────────────────────────────────────────

function generateFutureDates() {
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
const FUTURE_DATES = generateFutureDates();

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block", marginLeft: 6, verticalAlign: "middle" }}>
      <span onClick={() => setOpen(!open)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        style={{ fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #999", fontSize: 11, fontWeight: 700, color: "#888", cursor: "pointer", userSelect: "none", lineHeight: 1 }}>
        i
      </span>
      {open && (
        <span style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", color: "#eee", fontSize: 11, lineHeight: 1.5, fontFamily: FONT, padding: "10px 12px", borderRadius: 3, width: 280, zIndex: 300, boxShadow: "0 4px 16px rgba(0,0,0,0.25)", whiteSpace: "pre-line" }}>
          {text}
          <span style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1a1a1a" }} />
        </span>
      )}
    </span>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const s = {
  app: { fontFamily: FONT, maxWidth: 480, margin: "0 auto", padding: "20px 12px 80px", background: "#fdfdfd", minHeight: "100vh", color: "#1a1a1a", fontSize: 14, lineHeight: 1.5, boxSizing: "border-box", overflowX: "hidden" },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4, letterSpacing: -0.5, fontFamily: FONT },
  subtitle: { fontSize: 11, color: "#888", marginBottom: 24, textTransform: "uppercase", letterSpacing: 1.5 },
  sectionTitle: { fontSize: 15, fontWeight: 700, borderBottom: "2px solid #1a1a1a", paddingBottom: 4, marginBottom: 12, marginTop: 28, fontFamily: FONT },
  label: { fontSize: 12, color: "#555", marginBottom: 3, display: "block", fontFamily: FONT },
  input: { fontFamily: FONT, fontSize: 14, border: "1px solid #ccc", borderRadius: 2, padding: "6px 8px", width: "100%", boxSizing: "border-box", background: "#fff", outline: "none", marginBottom: 10 },
  select: { fontFamily: FONT, fontSize: 14, border: "1px solid #ccc", borderRadius: 2, padding: "6px 8px", width: "100%", boxSizing: "border-box", background: "#fff", outline: "none", marginBottom: 10, cursor: "pointer" },
  btn: { fontFamily: FONT, fontSize: 12, border: "1px solid #1a1a1a", borderRadius: 2, padding: "6px 10px", background: "#f0f0f0", cursor: "pointer", fontWeight: 600, transition: "background 0.1s", whiteSpace: "nowrap" },
  btnPrimary: { fontFamily: FONT, fontSize: 12, border: "2px solid #1a1a1a", borderRadius: 2, padding: "8px 14px", background: "#1a1a1a", color: "#fff", cursor: "pointer", fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" },
  row: { display: "flex", gap: 10 },
  half: { flex: 1 },
  nav: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#fdfdfd", borderTop: "1px solid #e0e0e0", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 480, margin: "0 auto", boxSizing: "border-box", zIndex: 50, gap: 4 },
  progressBar: { position: "fixed", top: 0, left: 0, height: 3, background: "#1a1a1a", transition: "width 0.3s ease", zIndex: 200 },
  stepIndicator: { fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 },
  editBtn: { fontFamily: FONT, fontSize: 11, border: "1px solid #ccc", borderRadius: 2, padding: "3px 10px", background: "#fff", cursor: "pointer", fontWeight: 600, color: "#555", marginLeft: 8 },
  summarySection: { marginBottom: 16, padding: "10px 0", borderBottom: "1px solid #eee" },
  summarySectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  summarySectionTitle: { fontWeight: 700, fontSize: 13, fontFamily: FONT },
  summaryDetail: { fontSize: 13, color: "#555", lineHeight: 1.6 },
  dateSuggestion: { fontFamily: FONT, fontSize: 11, color: "#888", padding: "4px 8px", cursor: "pointer", borderBottom: "1px solid #f0f0f0" },
  counter: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  counterBtn: { fontFamily: FONT, fontSize: 16, border: "1px solid #ccc", borderRadius: 2, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f0f0", cursor: "pointer", fontWeight: 700, lineHeight: 1, padding: 0 },
  counterValue: { fontFamily: FONT, fontSize: 20, fontWeight: 700, minWidth: 30, textAlign: "center" },
  tag: (type) => {
    const c = { Prioritaire: { bg: "#1a1a1a", color: "#fff" }, Secondaire: { bg: "#e0e0e0", color: "#1a1a1a" }, Annexe: { bg: "#fff", color: "#888", border: "1px solid #ccc" } }[type] || { bg: "#fff", color: "#888", border: "1px solid #ccc" };
    return { fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 2, background: c.bg, color: c.color, border: c.border || "none", textTransform: "uppercase", letterSpacing: 1, display: "inline-block" };
  },
  deleteBtn: { fontFamily: FONT, fontSize: 11, border: "none", background: "none", color: "#c00", cursor: "pointer", padding: "2px 6px", fontWeight: 600 },
  objectiveRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" },
};

const genderBtn = (active) => ({ fontFamily: FONT, fontSize: 13, border: active ? "2px solid #1a1a1a" : "1px solid #ccc", borderRadius: 2, padding: "6px 16px", background: active ? "#1a1a1a" : "#fff", color: active ? "#fff" : "#1a1a1a", cursor: "pointer", fontWeight: active ? 700 : 400, transition: "all 0.1s" });
const dayBtn = (active) => ({ fontFamily: FONT, fontSize: 12, border: active ? "2px solid #1a1a1a" : "1px solid #ccc", borderRadius: 2, padding: "6px 0", background: active ? "#1a1a1a" : "#fff", color: active ? "#fff" : "#1a1a1a", cursor: "pointer", fontWeight: active ? 700 : 400, flex: 1, textAlign: "center" });

// ── Phase colors (consistent across app) ─────────────────────────────

const PHASE_COLORS = {
  "Base": "#7ec8e3",
  "Construction": "#e8873c",
  "Spécifique": "#d63031",
  "Affûtage": "#4a9e4a",
};

const PHASE_DESCRIPTIONS = {
  "Base": {
    title: "Base",
    subtitle: "Construire le socle aérobie",
    desc: "Montée progressive du volume en endurance fondamentale. L'objectif est d'installer une base de km solide avant d'introduire l'intensité. Fin de phase : semaine d'assimilation (−25%).",
    icon: "▧",
  },
  "Construction": {
    title: "Construction",
    subtitle: "Développer la résistance",
    desc: "Introduction progressive de l'intensité (seuil, tempo) tout en maintenant le volume. Semaines d'assimilation régulières (−30%) pour absorber la charge. Phase la plus longue du plan.",
    icon: "▨",
  },
  "Spécifique": {
    title: "Spécifique",
    subtitle: "Affûter pour la distance cible",
    desc: "Séances aux allures de course. Volume stabilisé ou en légère hausse (+5%). Intensité maximale ciblée sur la distance objectif. Dernière ligne droite avant l'affûtage.",
    icon: "▩",
  },
  "Affûtage": {
    title: "Affûtage",
    subtitle: "Arriver frais le jour J",
    desc: "Réduction du volume (−25 à −30%) tout en maintenant quelques rappels d'intensité. Le corps assimile les semaines précédentes. Vous arrivez au départ en pleine forme.",
    icon: "◫",
  },
};

// ── Onboarding Steps ────────────────────────────────────────────────

function ProfileStep({ data, onChange }) {
  const handleDist = (e) => { const d = e.target.value; onChange({ ...data, refDistance: d, refTime: DEFAULT_TIMES[d] || "" }); };
  return (
    <div>
      <div style={s.sectionTitle}>Profil</div>
      <div style={s.row}>
        <div style={s.half}>
          <label style={s.label}>Prénom</label>
          <input style={s.input} value={data.firstName} onChange={(e) => onChange({ ...data, firstName: e.target.value })} placeholder="ex: Rémi" />
        </div>
        <div style={s.half}>
          <label style={s.label}>Nom</label>
          <input style={s.input} value={data.lastName} onChange={(e) => onChange({ ...data, lastName: e.target.value })} placeholder="ex: Dupont" />
        </div>
      </div>
      <label style={s.label}>Date de naissance</label>
      <input style={s.input} type="date" value={data.birthDate} onChange={(e) => onChange({ ...data, birthDate: e.target.value })} />
      <label style={s.label}>Genre</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["Homme", "Femme", "Autre"].map((g) => <button key={g} style={genderBtn(data.gender === g)} onClick={() => onChange({ ...data, gender: g })}>{g}</button>)}
      </div>
      <div style={s.sectionTitle}>Dernière course référence</div>
      <label style={s.label}>Distance</label>
      <select style={s.select} value={data.refDistance} onChange={handleDist}>
        <option value="">— Choisir —</option>
        {ALL_DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      {data.refDistance && (
        <>
          <label style={s.label}>Temps (suggestion : {DEFAULT_TIMES[data.refDistance]})</label>
          <input style={s.input} value={data.refTime} onChange={(e) => onChange({ ...data, refTime: e.target.value })} placeholder={DEFAULT_TIMES[data.refDistance]} />
        </>
      )}
    </div>
  );
}

function HistoryStep({ data, onChange }) {
  return (
    <div>
      <div style={s.sectionTitle}>Historique</div>
      <label style={s.label}>Total km sur l'année précédente <InfoTooltip text="Nous avons besoin d'une estimation de votre volume annuel pour calibrer votre plan. Pas besoin d'être exact — une estimation raisonnable suffit." /></label>
      <input style={s.input} type="number" value={data.yearKm} onChange={(e) => onChange({ ...data, yearKm: e.target.value })} placeholder="ex: 1500" />
      <label style={s.label}>Km/semaine (moyenne 4 dernières semaines)</label>
      <input style={s.input} type="number" value={data.avgWeekKm} onChange={(e) => onChange({ ...data, avgWeekKm: e.target.value })} placeholder="ex: 45" />
      <label style={s.label}>Km sur la dernière semaine</label>
      <input style={s.input} type="number" value={data.lastWeekKm} onChange={(e) => onChange({ ...data, lastWeekKm: e.target.value })} placeholder="ex: 50" />
    </div>
  );
}

function AvailabilityStep({ data, onChange }) {
  const toggleDay = (day) => { const days = data.trainingDays.includes(day) ? data.trainingDays.filter((d) => d !== day) : [...data.trainingDays, day]; onChange({ ...data, trainingDays: days }); };
  return (
    <div>
      <div style={s.sectionTitle}>Disponibilité</div>
      <label style={s.label}>Nombre de séances par semaine</label>
      <div style={s.counter}>
        <button style={s.counterBtn} onClick={() => onChange({ ...data, sessionsPerWeek: Math.max(1, data.sessionsPerWeek - 1) })}>−</button>
        <span style={s.counterValue}>{data.sessionsPerWeek}</span>
        <button style={s.counterBtn} onClick={() => onChange({ ...data, sessionsPerWeek: Math.min(14, data.sessionsPerWeek + 1) })}>+</button>
        <span style={{ fontSize: 12, color: "#888" }}>séances/sem.</span>
      </div>
      {data.sessionsPerWeek > 7 && <div style={{ fontSize: 11, color: "#b08000", marginBottom: 8 }}>↳ {data.sessionsPerWeek} séances = biquotidien sur {data.sessionsPerWeek - 7} jour{data.sessionsPerWeek - 7 > 1 ? "s" : ""}</div>}
      <label style={s.label}>Jours d'entraînement</label>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {DAYS_LIST.map((day) => <button key={day} style={dayBtn(data.trainingDays.includes(day))} onClick={() => toggleDay(day)}>{day}</button>)}
      </div>
      <div style={{ fontSize: 11, color: "#888" }}>{data.trainingDays.length} jour{data.trainingDays.length > 1 ? "s" : ""} sélectionné{data.trainingDays.length > 1 ? "s" : ""}</div>
    </div>
  );
}

function ObjectiveModal({ onClose, onAdd }) {
  const [obj, setObj] = useState({ date: "", distance: "", type: "" });
  const [showSugg, setShowSugg] = useState(true);
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div style={{ background: "#fdfdfd", border: "2px solid #1a1a1a", borderRadius: 2, padding: 20, width: "90%", maxWidth: 400, fontFamily: FONT }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Nouvel objectif</div>
        <label style={s.label}>Date de la course</label>
        <input style={s.input} type="date" value={obj.date} onChange={(e) => { setObj({ ...obj, date: e.target.value }); setShowSugg(false); }} />
        {showSugg && (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 2, marginTop: -6, marginBottom: 10, maxHeight: 150, overflowY: "auto", background: "#fff" }}>
            <div style={{ fontSize: 10, color: "#aaa", padding: "6px 8px 2px", textTransform: "uppercase", letterSpacing: 1 }}>Dates suggérées</div>
            {FUTURE_DATES.map((fd) => <div key={fd.iso} style={s.dateSuggestion} onClick={() => { setObj({ ...obj, date: fd.iso }); setShowSugg(false); }} onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"} onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>{fd.label}</div>)}
          </div>
        )}
        <label style={s.label}>Distance</label>
        <select style={s.select} value={obj.distance} onChange={(e) => setObj({ ...obj, distance: e.target.value })}>
          <option value="">— Choisir —</option>
          {OBJECTIVE_DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label style={s.label}>Type d'objectif <InfoTooltip text={`Prioritaire — vos courses phares, celles où vous visez votre meilleure forme. Elles orientent la structure de votre plan.\n\nSecondaire — des courses où vous voulez performer, sans qu'elles dictent votre préparation.\n\nAnnexe — des courses de préparation, abordées comme des entraînements en conditions réelles.\n\nRecommandé : 2-3 prioritaires/an, 3-6 secondaires, et autant d'annexes que souhaité.`} /></label>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {OBJ_TYPES.map((t) => <button key={t} style={genderBtn(obj.type === t)} onClick={() => setObj({ ...obj, type: t })}>{t}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={s.btn} onClick={onClose}>Annuler</button>
          <button style={{ ...s.btnPrimary, opacity: obj.date && obj.distance && obj.type ? 1 : 0.4 }} onClick={() => { if (obj.date && obj.distance && obj.type) onAdd(obj); }}>Ajouter</button>
        </div>
      </div>
    </div>
  );
}

function ObjectivesStep({ objectives, onAdd, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const fmt = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); };
  return (
    <div>
      <div style={s.sectionTitle}>Objectifs</div>
      {objectives.length === 0 && <div style={{ color: "#aaa", fontSize: 13, marginBottom: 12 }}>Aucun objectif défini.</div>}
      {objectives.map((obj, i) => (
        <div key={i} style={s.objectiveRow}>
          <div><span style={s.tag(obj.type)}>{obj.type}</span><span style={{ marginLeft: 8, fontWeight: 600 }}>{obj.distance}</span><span style={{ marginLeft: 8, color: "#888", fontSize: 12 }}>{fmt(obj.date)}</span></div>
          <button style={s.deleteBtn} onClick={() => onDelete(i)}>✕</button>
        </div>
      ))}
      <button style={{ ...s.btn, marginTop: 12 }} onClick={() => setShowModal(true)}>+ Ajouter un objectif</button>
      {showModal && <ObjectiveModal onClose={() => setShowModal(false)} onAdd={(o) => { onAdd(o); setShowModal(false); }} />}
    </div>
  );
}

function Summary({ profile, history, availability, objectives, onEdit }) {
  const fmt = (d) => { if (!d) return "—"; const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); };
  return (
    <div>
      <div style={s.sectionTitle}>Récapitulatif</div>
      <div style={s.summarySection}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Profil</span><button style={s.editBtn} onClick={() => onEdit(0)}>Éditer ✎</button></div>
        <div style={s.summaryDetail}>{profile.firstName || "—"} {profile.lastName || "—"}{profile.gender ? ` · ${profile.gender}` : ""}{profile.birthDate ? ` · Né(e) le ${fmt(profile.birthDate)}` : ""}</div>
        {profile.refDistance && <div style={s.summaryDetail}>Référence : {profile.refDistance} en {profile.refTime}</div>}
      </div>
      <div style={s.summarySection}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Historique</span><button style={s.editBtn} onClick={() => onEdit(1)}>Éditer ✎</button></div>
        <div style={s.summaryDetail}>{history.yearKm || "—"} km/an · {history.avgWeekKm || "—"} km/sem (moy.) · {history.lastWeekKm || "—"} km dernière sem.</div>
      </div>
      <div style={s.summarySection}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Disponibilité</span><button style={s.editBtn} onClick={() => onEdit(2)}>Éditer ✎</button></div>
        <div style={s.summaryDetail}>{availability.sessionsPerWeek} séances/sem.{availability.sessionsPerWeek > 7 ? ` (dont biquotidien ${availability.sessionsPerWeek - 7}×)` : ""} · {availability.trainingDays.join(", ") || "—"}</div>
      </div>
      <div style={{ ...s.summarySection, borderBottom: "none" }}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Objectifs ({objectives.length})</span><button style={s.editBtn} onClick={() => onEdit(3)}>Éditer ✎</button></div>
        {objectives.length === 0 && <div style={s.summaryDetail}>Aucun objectif défini.</div>}
        {objectives.map((obj, i) => <div key={i} style={{ ...s.summaryDetail, marginBottom: 4 }}><span style={s.tag(obj.type)}>{obj.type}</span> <span style={{ fontWeight: 600 }}>{obj.distance}</span> — {fmt(obj.date)}</div>)}
      </div>
      <div style={{ marginTop: 20, padding: 12, border: "2px solid #1a1a1a", borderRadius: 2, background: "#f8f8f0", fontSize: 12, color: "#555" }}>✓ Profil complet. Prêt à générer le plan d'entraînement.</div>
    </div>
  );
}

// ── Pace Screen ─────────────────────────────────────────────────────

const PACE_ORDER = ["Easy", "Actif", "Seuil1", "Tempo", "Seuil2", "VMALongue", "VMACourte"];
const ZONE_COLORS = {
  Easy: "#7ec8e3", Actif: "#4ca8a8", Seuil1: "#4a9e4a", Tempo: "#e8c840",
  Seuil2: "#e8873c", VMALongue: "#d63031", VMACourte: "#8b1a1a",
};

function PaceScreen({ profile, paces, onPacesChange }) {
  const [editing, setEditing] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [editPaces, setEditPaces] = useState(null);

  const vdot = computeVDOT(
    DISTANCE_METERS[profile.refDistance] || 10000,
    parseTimeToSeconds(profile.refTime || "40:00")
  );

  const handleEditClick = () => {
    if (!editing) { setShowWarning(true); } else {
      if (editPaces) onPacesChange(editPaces);
      setEditing(false); setEditPaces(null);
    }
  };

  const confirmEdit = () => {
    setShowWarning(false); setEditing(true);
    const copy = {};
    Object.keys(paces).forEach((k) => { copy[k] = { ...paces[k] }; });
    setEditPaces(copy);
  };

  const cancelEdit = () => { setEditing(false); setEditPaces(null); };

  const updatePace = (zone, bound, val) => {
    const parts = val.split(":").map(Number);
    let sec = 0;
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) sec = parts[0] * 60 + parts[1];
    if (sec > 0) setEditPaces((prev) => ({ ...prev, [zone]: { ...prev[zone], [bound]: sec } }));
  };

  const displayPaces = editing && editPaces ? editPaces : paces;

  return (
    <div>
      <div style={s.sectionTitle}>Vos allures d'entraînement</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6, lineHeight: 1.6 }}>
        Calculées à partir de votre course référence ({profile.refDistance} en {profile.refTime}).
      </div>
      <div style={{ display: "inline-block", padding: "4px 10px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: 2, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
        Score VDOT : {vdot.toFixed(1)}
        <InfoTooltip text={`Le VDOT est un indice de performance dérivé de votre course référence (méthode Jack Daniels). Il sert de base unique pour calculer toutes vos allures d'entraînement.\n\nPlus votre VDOT est élevé, plus vous êtes performant.`} />
      </div>
      <div style={{ marginBottom: 12 }}>
        {PACE_ORDER.map((zone) => {
          const p = displayPaces[zone];
          if (!p) return null;
          const color = ZONE_COLORS[zone] || "#888";
          return (
            <div key={zone} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ width: 4, height: 36, background: color, borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.label || zone}</div>
                <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>{p.desc}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 85, flexShrink: 0 }}>
                {editing ? (
                  <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "flex-end" }}>
                    <input style={{ ...s.input, width: 48, marginBottom: 0, textAlign: "center", fontSize: 12, padding: "4px" }} defaultValue={formatPace(p.fast)} onBlur={(e) => updatePace(zone, "fast", e.target.value)} />
                    <span style={{ fontSize: 10, color: "#aaa" }}>→</span>
                    <input style={{ ...s.input, width: 48, marginBottom: 0, textAlign: "center", fontSize: 12, padding: "4px" }} defaultValue={formatPace(p.slow)} onBlur={(e) => updatePace(zone, "slow", e.target.value)} />
                  </div>
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 13, fontFamily: FONT, whiteSpace: "nowrap" }}>
                    {formatPace(p.fast)} → {formatPace(p.slow)}
                    <div style={{ fontSize: 10, color: "#aaa", fontWeight: 400 }}>/km</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={s.btn} onClick={handleEditClick}>{editing ? "Sauvegarder ✓" : "Éditer les allures ✎"}</button>
        {editing && <button style={{ ...s.btn, color: "#c00", borderColor: "#c00" }} onClick={cancelEdit}>Annuler</button>}
      </div>
      {showWarning && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowWarning(false)}>
          <div style={{ background: "#fdfdfd", border: "2px solid #c00", borderRadius: 2, padding: 20, width: "90%", maxWidth: 400, fontFamily: FONT }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#c00" }}>⚠ Attention</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", marginBottom: 8 }}>
              Vos allures sont calibrées à partir de votre performance réelle. Elles sont conçues pour maximiser votre progression tout en limitant le risque de blessure.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>Augmenter les allures ne vous fera pas progresser plus vite.</span> Au contraire, cela augmente significativement le risque de surentraînement et de blessure.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", marginBottom: 16 }}>
              Si vous estimez que vos allures sont sous-calibrées, nous recommandons de suivre le plan tel quel pendant 4 semaines, puis de refaire un test de référence pour recalibrer.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={s.btn} onClick={() => setShowWarning(false)}>Garder mes allures</button>
              <button style={{ ...s.btn, background: "#fff3f3", borderColor: "#c00", color: "#c00" }} onClick={confirmEdit}>Modifier quand même</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Structure Screen (NEW) ──────────────────────────────────────────

function VolumeChart({ schedule, cycleIndex }) {
  if (!schedule || schedule.length === 0) return null;

  const chartWidth = 440;
  const chartHeight = 180;
  const padTop = 20;
  const padBottom = 30;
  const padLeft = 40;
  const padRight = 12;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const maxVol = Math.max(...schedule.map(w => w.volume));
  const yMax = maxVol * 1.12;
  const yMin = 0;

  const barWidth = Math.max(4, Math.min(20, (innerW / schedule.length) - 2));
  const gap = (innerW - barWidth * schedule.length) / Math.max(1, schedule.length - 1);

  const getX = (i) => padLeft + i * (barWidth + gap);
  const getY = (vol) => padTop + innerH - ((vol - yMin) / (yMax - yMin)) * innerH;

  // Y-axis grid lines
  const gridCount = 4;
  const gridStep = (yMax - yMin) / gridCount;
  const gridLines = [];
  for (let i = 0; i <= gridCount; i++) {
    const val = yMin + gridStep * i;
    gridLines.push({ val: Math.round(val), y: getY(val) });
  }

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ display: "block", marginBottom: 8 }}>
      {/* Grid */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padLeft} y1={g.y} x2={chartWidth - padRight} y2={g.y} stroke="#e8e8e8" strokeWidth="1" />
          <text x={padLeft - 4} y={g.y + 3} textAnchor="end" fontSize="9" fontFamily={FONT} fill="#aaa">{g.val}</text>
        </g>
      ))}

      {/* Bars */}
      {schedule.map((w, i) => {
        const x = getX(i);
        const y = getY(w.volume);
        const h = padTop + innerH - y;
        const color = PHASE_COLORS[w.phase] || "#ccc";
        const isAssim = w.isAssim;

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, h)}
              fill={isAssim ? "none" : color}
              stroke={isAssim ? color : "none"}
              strokeWidth={isAssim ? 1.5 : 0}
              strokeDasharray={isAssim ? "3,2" : "none"}
              rx="1"
              opacity={isAssim ? 0.7 : 0.85}
            />
            {/* Assimilation marker */}
            {isAssim && (
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize="7" fontFamily={FONT} fill={color} fontWeight="700">↓</text>
            )}
            {/* Volume label on hover area — show every N weeks */}
            {(i === 0 || i === schedule.length - 1 || (i + 1) % Math.max(1, Math.ceil(schedule.length / 8)) === 0) && (
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="8" fontFamily={FONT} fill="#888" fontWeight="600">
                {Math.round(w.volume)}
              </text>
            )}
          </g>
        );
      })}

      {/* X-axis week labels */}
      {schedule.map((w, i) => {
        const x = getX(i) + barWidth / 2;
        const show = schedule.length <= 16 || (i + 1) % Math.max(1, Math.ceil(schedule.length / 12)) === 0 || i === 0;
        if (!show) return null;
        return (
          <text key={`xl-${i}`} x={x} y={chartHeight - 6} textAnchor="middle" fontSize="8" fontFamily={FONT} fill="#aaa">
            S{w.week}
          </text>
        );
      })}

      {/* Y-axis label */}
      <text x={4} y={padTop - 6} fontSize="8" fontFamily={FONT} fill="#aaa">km</text>
    </svg>
  );
}

function PhaseTimeline({ schedule }) {
  if (!schedule || schedule.length === 0) return null;

  // Group consecutive weeks by phase
  const groups = [];
  let current = null;
  schedule.forEach((w) => {
    if (!current || current.phase !== w.phase) {
      current = { phase: w.phase, weeks: [w] };
      groups.push(current);
    } else {
      current.weeks.push(w);
    }
  });

  const totalWeeks = schedule.length;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Timeline bar */}
      <div style={{ display: "flex", height: 28, borderRadius: 2, overflow: "hidden", border: "1px solid #e0e0e0" }}>
        {groups.map((g, i) => {
          const pct = (g.weeks.length / totalWeeks) * 100;
          const color = PHASE_COLORS[g.phase] || "#ccc";
          return (
            <div key={i} style={{
              width: `${pct}%`,
              background: color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontFamily: FONT, fontWeight: 700, color: "#fff",
              letterSpacing: 0.5,
              borderRight: i < groups.length - 1 ? "1px solid rgba(255,255,255,0.3)" : "none",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "0 2px",
            }}>
              {g.weeks.length >= 2 ? `${g.weeks.length}s` : ""}
            </div>
          );
        })}
      </div>
      {/* Phase labels below */}
      <div style={{ display: "flex", marginTop: 4 }}>
        {groups.map((g, i) => {
          const pct = (g.weeks.length / totalWeeks) * 100;
          return (
            <div key={i} style={{
              width: `${pct}%`, textAlign: "center",
              fontSize: 9, fontFamily: FONT, color: "#888",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              padding: "0 1px",
            }}>
              {g.weeks.length >= 3 ? g.phase : g.phase.charAt(0)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StructureScreen({ plan, history, profile }) {
  if (!plan || !plan.cycles || plan.cycles.length === 0) {
    return (
      <div>
        <div style={s.sectionTitle}>Structure du plan</div>
        <div style={{ color: "#c00", fontSize: 13, padding: 12, border: "1px solid #c00", borderRadius: 2 }}>
          Impossible de générer le plan. Vérifiez vos objectifs et votre historique.
        </div>
      </div>
    );
  }

  const startingVol = computeStartingVolume(
    parseFloat(history.avgWeekKm) || 40,
    parseFloat(history.lastWeekKm) || 40
  );

  return (
    <div>
      <div style={s.sectionTitle}>Structure du plan</div>

      <div style={{ fontSize: 12, color: "#666", marginBottom: 4, lineHeight: 1.6 }}>
        Périodisation calculée à partir de votre volume actuel ({Math.round(startingVol)} km/sem) et de vos objectifs.
      </div>

      {/* Warnings */}
      {plan.warnings.length > 0 && (
        <div style={{ margin: "12px 0", padding: 10, background: "#fff8f0", border: "1px solid #e8c840", borderRadius: 2 }}>
          {plan.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: "#8a6d00", lineHeight: 1.6, marginBottom: i < plan.warnings.length - 1 ? 4 : 0 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* Cycles */}
      {plan.cycles.map((cycle, ci) => {
        const { phases, volumeSchedule, objective } = cycle;
        const fmt = (d) => {
          if (!d) return "";
          const dt = d instanceof Date ? d : new Date(d + "T00:00:00");
          return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        };

        if (!phases.valid) {
          return (
            <div key={ci} style={{ margin: "16px 0", padding: 12, border: "1px solid #c00", borderRadius: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#c00", marginBottom: 4 }}>
                ❌ Cycle {ci + 1} — invalide
              </div>
              {phases.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11, color: "#c00" }}>→ {w}</div>
              ))}
            </div>
          );
        }

        const totalWeeks = phases.base + phases.construction + phases.specific + phases.taper;
        const peakVol = volumeSchedule.length > 0 ? Math.max(...volumeSchedule.map(w => w.volume)) : 0;
        const assimCount = volumeSchedule.filter(w => w.isAssim).length;

        return (
          <div key={ci} style={{ marginTop: 20 }}>
            {/* Cycle header */}
            <div style={{
              padding: "8px 12px",
              background: "#1a1a1a", color: "#fff",
              borderRadius: "2px 2px 0 0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT }}>
                  {objective ? `Préparation ${objective.distance} sur ${totalWeeks} semaines` : `Préparation continue`}
                </span>
              </div>
              <span style={{ fontSize: 11, fontFamily: FONT, color: "#aaa" }}>
                {objective ? fmt(objective.date) : ""}
              </span>
            </div>

            <div style={{ border: "1px solid #e0e0e0", borderTop: "none", borderRadius: "0 0 2px 2px", padding: 12 }}>
              {/* Cycle warnings */}
              {phases.warnings.length > 0 && (
                <div style={{ marginBottom: 10, padding: 8, background: "#fff8f0", border: "1px solid #e8c840", borderRadius: 2 }}>
                  {phases.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#8a6d00", lineHeight: 1.5 }}>⚠ {w}</div>
                  ))}
                </div>
              )}

              {/* Phase breakdown row */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  { label: "Base", val: phases.base },
                  { label: "Construction", val: phases.construction },
                  { label: "Spécifique", val: phases.specific },
                  { label: "Affûtage", val: phases.taper },
                ].filter(p => p.val > 0).map((p) => (
                  <div key={p.label} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px",
                    background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 2,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: 1, background: PHASE_COLORS[p.label] || "#ccc" }} />
                    <span style={{ fontSize: 11, fontFamily: FONT, fontWeight: 600 }}>{p.label}</span>
                    <span style={{ fontSize: 11, fontFamily: FONT, color: "#888" }}>{p.val}s</span>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, fontFamily: FONT }}>
                  <span style={{ color: "#888" }}>Pic volume</span>{" "}
                  <span style={{ fontWeight: 700 }}>{Math.round(peakVol)} km</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: FONT }}>
                  <span style={{ color: "#888" }}>Assimilations</span>{" "}
                  <span style={{ fontWeight: 700 }}>{assimCount}</span>
                </div>
                {phases.taperType !== "none" && (
                  <div style={{ fontSize: 11, fontFamily: FONT }}>
                    <span style={{ color: "#888" }}>Affûtage</span>{" "}
                    <span style={{ fontWeight: 700 }}>{phases.taperType}</span>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <PhaseTimeline schedule={volumeSchedule} />

              {/* Volume chart */}
              <VolumeChart schedule={volumeSchedule} cycleIndex={ci} />

              {/* Week table */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", padding: "4px 0", borderBottom: "1.5px solid #1a1a1a" }}>
                  <span style={{ width: 36, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textTransform: "uppercase" }}>Sem</span>
                  <span style={{ flex: 1, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textTransform: "uppercase" }}>Phase</span>
                  <span style={{ width: 60, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textAlign: "right", textTransform: "uppercase" }}>Volume</span>
                  <span style={{ width: 50, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textAlign: "right", textTransform: "uppercase" }}>Δ</span>
                </div>
                {volumeSchedule.map((w, i) => {
                  const prevVol = i > 0 ? volumeSchedule[i - 1].volume : null;
                  const delta = prevVol ? ((w.volume - prevVol) / prevVol * 100) : 0;
                  const deltaStr = prevVol ? `${delta >= 0 ? "+" : ""}${Math.round(delta)}%` : "";
                  const color = PHASE_COLORS[w.phase] || "#ccc";

                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", padding: "5px 0",
                      borderBottom: "1px solid #f2f2f2",
                      background: w.isAssim ? "#fafafa" : "transparent",
                    }}>
                      <span style={{ width: 36, fontSize: 12, fontWeight: 600, fontFamily: FONT }}>
                        {w.week}
                      </span>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 1, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontFamily: FONT, color: "#555" }}>
                          {w.phase}
                        </span>
                        {w.isAssim && (
                          <span style={{
                            fontSize: 9, fontFamily: FONT, fontWeight: 700,
                            padding: "1px 5px", border: "1px dashed #aaa", borderRadius: 2, color: "#888",
                          }}>
                            ASSIM
                          </span>
                        )}
                      </div>
                      <span style={{ width: 60, textAlign: "right", fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
                        {Math.round(w.volume)}
                        <span style={{ fontWeight: 400, fontSize: 10, color: "#aaa" }}> km</span>
                      </span>
                      <span style={{
                        width: 50, textAlign: "right", fontSize: 11, fontFamily: FONT,
                        color: delta < -10 ? "#2a6e2a" : delta < 0 ? "#666" : delta > 15 ? "#c00" : "#888",
                        fontWeight: Math.abs(delta) > 15 ? 700 : 400,
                      }}>
                        {deltaStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Phase legend — below cycles */}
      <div style={{ ...s.sectionTitle, marginTop: 28, fontSize: 13 }}>Comprendre les 4 phases</div>
      <div style={{ marginBottom: 20 }}>
        {["Base", "Construction", "Spécifique", "Affûtage"].map((phase) => {
          const info = PHASE_DESCRIPTIONS[phase];
          const color = PHASE_COLORS[phase];
          return (
            <div key={phase} style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ width: 4, height: 44, background: color, borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT }}>
                  <span style={{ marginRight: 6 }}>{info.icon}</span>
                  {info.title}
                  <span style={{ fontWeight: 400, fontSize: 11, color: "#888", marginLeft: 8 }}>{info.subtitle}</span>
                </div>
                <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5, marginTop: 2 }}>{info.desc}</div>
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
          <div style={{ width: 4, height: 20, border: "1.5px dashed #aaa", borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 700, fontSize: 12, fontFamily: FONT }}>↓ Assimilation</span>
            <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Semaines de décharge pour absorber la charge</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PDF Export ──────────────────────────────────────────────────────

async function generatePlanPDF(weeklyPlan, plan, profile, availability, paces) {
  // Dynamically load jsPDF
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  document.head.appendChild(script);
  
  await new Promise((resolve) => {
    script.onload = resolve;
  });
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  
  // Colors (RGB)
  const colors = {
    black: [26, 26, 26],
    gray: [136, 136, 136],
    lightGray: [238, 238, 238],
    white: [255, 255, 255],
    phases: {
      "Base": [126, 200, 227],
      "Construction": [232, 135, 60],
      "Spécifique": [214, 48, 49],
      "Affûtage": [74, 158, 74],
    },
    sessions: {
      "EF": [126, 200, 227],
      "SL": [76, 168, 168],
      "SEUIL": [232, 135, 60],
      "VMA": [214, 48, 49],
      "TEMPO": [232, 200, 64],
      "RECUP": [158, 158, 158],
    }
  };
  
  const objective = plan?.cycles?.[0]?.objective;
  const totalVolLow = Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.low || w.volume), 0));
  const totalVolHigh = Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.high || w.volume), 0));
  const totalVolume = totalVolLow === totalVolHigh ? `${totalVolLow}` : `${totalVolLow}-${totalVolHigh}`;
  const totalSessions = weeklyPlan.reduce((sum, w) => sum + w.sessions.filter(s => !s.isRest).length, 0);
  
  // Helper functions
  const setFont = (size, style = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
  };
  
  const drawRect = (x, y, w, h, color, fill = true) => {
    doc.setFillColor(...color);
    doc.setDrawColor(...color);
    if (fill) {
      doc.rect(x, y, w, h, 'F');
    } else {
      doc.rect(x, y, w, h, 'S');
    }
  };
  
  // ═══════════════════════════════════════════════════════════════════
  // PAGE 1: SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  
  let y = margin;
  
  // Header bar
  drawRect(0, 0, pageWidth, 35, colors.black);
  doc.setTextColor(...colors.white);
  setFont(22, 'bold');
  doc.text(objective ? `Préparation ${objective.distance}` : 'Plan d\'entraînement', margin, 18);
  setFont(10, 'normal');
  doc.text(`${weeklyPlan.length} semaines · ${availability.sessionsPerWeek} séances/semaine`, margin, 28);
  
  y = 50;
  doc.setTextColor(...colors.black);
  
  // Profile section
  setFont(12, 'bold');
  doc.text('PROFIL', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 6;
  
  setFont(10, 'normal');
  doc.text(`${profile.firstName || '—'} ${profile.lastName || ''}`, margin, y);
  if (profile.refDistance && profile.refTime) {
    doc.text(`Référence : ${profile.refDistance} en ${profile.refTime}`, margin + 80, y);
  }
  y += 12;
  
  // Plan overview
  setFont(12, 'bold');
  doc.text('APERÇU DU PLAN', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 8;
  
  // Stats boxes
  const boxWidth = (contentWidth - 10) / 3;
  const boxes = [
    { label: 'Semaines', value: weeklyPlan.length.toString() },
    { label: 'Séances', value: totalSessions.toString() },
    { label: 'Volume total', value: `${totalVolume} km` },
  ];
  
  boxes.forEach((box, i) => {
    const bx = margin + i * (boxWidth + 5);
    drawRect(bx, y, boxWidth, 20, colors.lightGray);
    setFont(16, 'bold');
    doc.text(box.value, bx + boxWidth / 2, y + 10, { align: 'center' });
    setFont(8, 'normal');
    doc.setTextColor(...colors.gray);
    doc.text(box.label, bx + boxWidth / 2, y + 16, { align: 'center' });
    doc.setTextColor(...colors.black);
  });
  y += 28;
  
  // Volume progression chart
  setFont(12, 'bold');
  doc.text('PROGRESSION DU VOLUME', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 8;
  
  const chartHeight = 35;
  const maxVol = Math.max(...weeklyPlan.map(w => w.volume));
  const barWidth = Math.min(8, (contentWidth - weeklyPlan.length) / weeklyPlan.length);
  const barGap = (contentWidth - barWidth * weeklyPlan.length) / (weeklyPlan.length - 1 || 1);
  
  weeklyPlan.forEach((w, i) => {
    const bh = (w.volume / maxVol) * chartHeight;
    const bx = margin + i * (barWidth + barGap);
    const by = y + chartHeight - bh;
    const phaseColor = colors.phases[w.phase] || colors.gray;
    drawRect(bx, by, barWidth, bh, phaseColor);
  });
  y += chartHeight + 8;
  
  // Phase legend
  const phases = ['Base', 'Construction', 'Spécifique', 'Affûtage'];
  let legendX = margin;
  setFont(8, 'normal');
  phases.forEach((phase) => {
    drawRect(legendX, y, 4, 4, colors.phases[phase]);
    doc.text(phase, legendX + 6, y + 3.5);
    legendX += doc.getTextWidth(phase) + 12;
  });
  y += 15;
  
  // Paces section
  setFont(12, 'bold');
  doc.text('VOS ALLURES', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 6;
  
  const paceList = [
    { key: 'Easy', label: 'Easy' },
    { key: 'Tempo', label: 'Tempo' },
    { key: 'Seuil2', label: 'Seuil 2' },
    { key: 'VMALongue', label: 'VMA longue' },
    { key: 'VMACourte', label: 'VMA courte' },
  ];
  
  setFont(9, 'normal');
  paceList.forEach((p, i) => {
    const pace = paces?.[p.key];
    if (pace) {
      const px = margin + (i % 3) * 60;
      const py = y + Math.floor(i / 3) * 8;
      doc.setTextColor(...colors.gray);
      doc.text(p.label + ':', px, py);
      doc.setTextColor(...colors.black);
      doc.text(`${formatPace(pace.fast)}-${formatPace(pace.slow)}`, px + 28, py);
    }
  });
  y += 22;
  
  // Phase breakdown
  setFont(12, 'bold');
  doc.text('STRUCTURE DES PHASES', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 8;
  
  // Count weeks per phase
  const phaseCounts = {};
  weeklyPlan.forEach(w => {
    phaseCounts[w.phase] = (phaseCounts[w.phase] || 0) + 1;
  });
  
  setFont(9, 'normal');
  let phaseX = margin;
  phases.forEach((phase) => {
    const count = phaseCounts[phase] || 0;
    if (count > 0) {
      drawRect(phaseX, y, 4, 10, colors.phases[phase]);
      doc.text(`${phase}: ${count} sem.`, phaseX + 6, y + 6);
      phaseX += 45;
    }
  });
  
  // Helper: format distance range for PDF
  const pdfDist = (d) => {
    if (typeof d === 'number') return `${d}`;
    if (d && d.low !== undefined) return d.low === d.high ? `${d.low}` : `${d.low}-${d.high}`;
    return '—';
  };

  // ═══════════════════════════════════════════════════════════════════
  // PAGES 2+: WEEKLY DETAILS WITH FULL SESSION BREAKDOWN
  // ═══════════════════════════════════════════════════════════════════

  weeklyPlan.forEach((weekData, weekIdx) => {
    doc.addPage();
    y = margin;

    const phaseColor = colors.phases[weekData.phase] || colors.gray;

    // Week header
    drawRect(0, 0, pageWidth, 30, phaseColor);
    doc.setTextColor(...colors.white);
    setFont(18, 'bold');
    doc.text(`Semaine ${weekData.week}`, margin, 14);
    setFont(10, 'normal');

    const dateRange = `${weekData.weekStartDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} — ${weekData.weekEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
    doc.text(dateRange, margin, 22);

    // Volume badge
    setFont(14, 'bold');
    doc.text(`${pdfDist(weekData.totalDistance)} km`, pageWidth - margin, 14, { align: 'right' });
    setFont(8, 'normal');
    doc.text('volume', pageWidth - margin, 21, { align: 'right' });

    y = 38;
    doc.setTextColor(...colors.black);

    // Week objective
    setFont(10, 'normal');
    doc.setTextColor(...colors.gray);
    let objText = `${weekData.phase} — ${weekData.objective}`;
    if (weekData.isAssim) objText += '  ·  SEMAINE D\'ASSIMILATION';
    doc.text(objText, margin, y);
    doc.setTextColor(...colors.black);
    y += 10;

    // Sessions with full detail
    weekData.sessions.forEach((session, si) => {
      // Rest day: simple gray line
      if (session.isRest) {
        if (y + 12 > pageHeight - 15) { doc.addPage(); y = margin; }
        setFont(9, 'normal');
        doc.setTextColor(...colors.gray);
        const restLabel = session.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + '  —  Jour off';
        doc.text(restLabel, margin + 6, y + 5);
        doc.setTextColor(...colors.black);
        y += 10;
        return;
      }
      const sessionColor = colors.sessions[session.type] || colors.gray;

      // Estimate height needed for this session
      const mainBlockCount = session.main ? session.main.length : 0;
      const hasWarmup = session.warmup && session.warmup.duration !== '—';
      const hasCooldown = session.cooldown && session.cooldown.duration !== '—';
      const hasNotes = session.notes && session.notes.trim().length > 0;
      const hasCoachTips = session.coach_tips && session.coach_tips.length > 0;
      const tipsCount = hasCoachTips ? (Array.isArray(session.coach_tips) ? session.coach_tips.length : 1) : 0;
      const estimatedHeight = 22 + (hasWarmup ? 14 : 0) + mainBlockCount * 12 + (hasCooldown ? 14 : 0) + (hasNotes ? 14 : 0) + (tipsCount * 7 + (hasCoachTips ? 10 : 0)) + 6;

      // Check if we need a new page
      if (y + estimatedHeight > pageHeight - 15) {
        doc.addPage();
        y = margin;
      }

      // Session header bar
      drawRect(margin, y, contentWidth, 18, sessionColor);
      doc.setTextColor(...colors.white);
      setFont(10, 'bold');
      doc.text(session.title, margin + 6, y + 7);
      setFont(9, 'normal');
      const sessionMeta = `${session.duration}  ·  ${pdfDist(session.distance)} km`;
      doc.text(sessionMeta, pageWidth - margin - 6, y + 7, { align: 'right' });

      // Date line
      y += 18;
      doc.setTextColor(...colors.black);
      setFont(8, 'normal');
      doc.setTextColor(...colors.gray);
      doc.text(session.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), margin + 6, y + 5);
      doc.setTextColor(...colors.black);
      y += 9;

      // Warmup
      if (hasWarmup) {
        drawRect(margin + 4, y, 2, 10, [126, 200, 227]); // light blue
        setFont(8, 'bold');
        doc.text('ÉCHAUFFEMENT', margin + 10, y + 4);
        setFont(8, 'normal');
        doc.setTextColor(...colors.gray);
        const warmupText = `${session.warmup.duration} @ ${session.warmup.pace}/km — ${session.warmup.description}`;
        doc.text(warmupText, margin + 10, y + 10);
        doc.setTextColor(...colors.black);
        y += 14;
      }

      // Main blocks
      if (session.main && session.main.length > 0) {
        drawRect(margin + 4, y, 2, session.main.length * 12, sessionColor);
        setFont(8, 'bold');
        doc.text('CORPS DE SÉANCE', margin + 10, y + 4);
        y += 7;

        setFont(8, 'normal');
        session.main.forEach((block) => {
          let blockText = block.description;
          if (block.pace && block.pace !== '—') blockText += ` @ ${block.pace}/km`;
          if (block.duration && block.duration !== '—') blockText += ` (${block.duration})`;

          // Truncate if too long
          const maxW = contentWidth - 16;
          if (doc.getTextWidth(blockText) > maxW) {
            while (doc.getTextWidth(blockText + '...') > maxW && blockText.length > 0) {
              blockText = blockText.slice(0, -1);
            }
            blockText += '...';
          }
          doc.text(blockText, margin + 10, y + 4);
          y += 8;
        });
        y += 2;
      }

      // Cooldown
      if (hasCooldown) {
        drawRect(margin + 4, y, 2, 10, [74, 158, 74]); // green
        setFont(8, 'bold');
        doc.text('RETOUR AU CALME', margin + 10, y + 4);
        setFont(8, 'normal');
        doc.setTextColor(...colors.gray);
        const cooldownText = `${session.cooldown.duration} @ ${session.cooldown.pace}/km — ${session.cooldown.description}`;
        doc.text(cooldownText, margin + 10, y + 10);
        doc.setTextColor(...colors.black);
        y += 14;
      }

      // Notes / Conseils
      if (hasNotes) {
        drawRect(margin + 4, y, contentWidth - 8, 12, [255, 250, 230]); // cream background
        setFont(7, 'italic');
        doc.setTextColor(100, 100, 100);
        let noteText = session.notes.trim();
        const maxW = contentWidth - 20;
        if (doc.getTextWidth(noteText) > maxW) {
          while (doc.getTextWidth(noteText + '...') > maxW && noteText.length > 0) {
            noteText = noteText.slice(0, -1);
          }
          noteText += '...';
        }
        doc.text(noteText, margin + 8, y + 8);
        doc.setTextColor(...colors.black);
        y += 16;
      }

      // Coach tips
      if (hasCoachTips) {
        const tips = Array.isArray(session.coach_tips) ? session.coach_tips : [session.coach_tips];
        drawRect(margin + 4, y, contentWidth - 8, tips.length * 8 + 6, [232, 245, 233]);
        setFont(7, 'bold');
        doc.setTextColor(46, 125, 50);
        doc.text('CONSEILS DU COACH', margin + 8, y + 5);
        setFont(7, 'normal');
        doc.setTextColor(27, 94, 32);
        tips.forEach((tip, ti) => {
          let tipText = `\u2022 ${tip}`;
          const maxW = contentWidth - 20;
          if (doc.getTextWidth(tipText) > maxW) {
            while (doc.getTextWidth(tipText + '...') > maxW && tipText.length > 0) {
              tipText = tipText.slice(0, -1);
            }
            tipText += '...';
          }
          doc.text(tipText, margin + 8, y + 11 + ti * 7);
        });
        doc.setTextColor(...colors.black);
        y += tips.length * 7 + 10;
      }

      y += 4;

      // Separator between sessions
      if (si < weekData.sessions.length - 1) {
        drawRect(margin + 20, y, contentWidth - 40, 0.3, colors.lightGray);
        y += 4;
      }
    });

    // Week total footer
    y += 4;
    drawRect(margin, y, contentWidth, 0.5, colors.black);
    y += 6;
    setFont(9, 'bold');
    doc.text(`Total semaine : ${weekData.sessions.filter(s => !s.isRest).length} séances · ${pdfDist(weekData.totalDistance)} km`, margin, y);
  });
  
  // Save
  const fileName = objective 
    ? `plan-${objective.distance.toLowerCase().replace(' ', '-')}-${weeklyPlan.length}sem.pdf`
    : `plan-entrainement-${weeklyPlan.length}sem.pdf`;
  doc.save(fileName);
}

// ── Plan Screen (Week-by-week view) ─────────────────────────────────

const SESSION_TYPES = {
  EF: { label: "Endurance Fondamentale", short: "EF", color: "#7ec8e3", icon: "○" },
  SL: { label: "Sortie Longue", short: "SL", color: "#4ca8a8", icon: "◎" },
  SEUIL: { label: "Seuil", short: "Seuil", color: "#e8873c", icon: "◆" },
  VMA: { label: "VMA", short: "VMA", color: "#d63031", icon: "▲" },
  TEMPO: { label: "Tempo", short: "Tempo", color: "#e8c840", icon: "■" },
  RECUP: { label: "Récupération", short: "Récup", color: "#9e9e9e", icon: "·" },
  COTES: { label: "Côtes", short: "Côtes", color: "#8b5a8b", icon: "⧫" },
  FARTLEK: { label: "Fartlek", short: "Fartlek", color: "#5a8b5a", icon: "◇" },
  PPG: { label: "PPG / Renforcement", short: "PPG", color: "#6a6a6a", icon: "+" },
};

// Compute phase boundaries for progression tracking
function computePhaseBoundaries(volumeSchedule) {
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

// Session plan generator with library-based progression
function generateWeeklyPlan(plan, availability, paces, startDate) {
  if (!plan || !plan.cycles || plan.cycles.length === 0) return [];

  const cycle = plan.cycles[0];
  const { volumeSchedule } = cycle;
  const sessionsPerWeek = availability?.sessionsPerWeek || 4;
  const trainingDays = availability?.trainingDays || ["Mar", "Jeu", "Sam", "Dim"];

  // Map day names to day offsets (Lun=0, Mar=1, etc.)
  const dayOffsets = { "Lun": 0, "Mar": 1, "Mer": 2, "Jeu": 3, "Ven": 4, "Sam": 5, "Dim": 6 };

  // Get paces for display (used by fallback hardcoded sessions)
  const easyPace = paces?.Easy ? `${formatPace(paces.Easy.slow)}-${formatPace(paces.Easy.fast)}` : "5:30-6:00";
  const tempoPace = paces?.Tempo ? `${formatPace(paces.Tempo.fast)}-${formatPace(paces.Tempo.slow)}` : "4:30-4:50";
  const seuilPace = paces?.Seuil2 ? `${formatPace(paces.Seuil2.fast)}-${formatPace(paces.Seuil2.slow)}` : "4:15-4:30";
  const vmaPace = paces?.VMACourte ? `${formatPace(paces.VMACourte.fast)}-${formatPace(paces.VMACourte.slow)}` : "3:45-4:00";

  const baseDate = startDate || new Date();
  const phaseBoundaries = computePhaseBoundaries(volumeSchedule);

  return volumeSchedule.map((weekData, idx) => {
    const { week, phase, volume, isAssim } = weekData;

    // Track progression within the phase
    const pb = phaseBoundaries[phase] || { start: 0, total: 1 };
    const weekInPhase = idx - pb.start + 1;
    const totalWeeksInPhase = pb.total;
    
    // Calculate week start date
    const weekStartDate = new Date(baseDate);
    weekStartDate.setDate(weekStartDate.getDate() + (idx * 7));
    
    // Generate sessions based on phase
    let sessions = [];
    const kmPerSession = volume / sessionsPerWeek;
    
    // Phase-specific focus text
    const phaseObjectives = {
      "Base": "Focus endurance — construire le socle aérobie",
      "Construction": "Focus résistance — introduction de l'intensité",
      "Spécifique": "Focus allure cible — préparation à l'objectif",
      "Affûtage": "Focus fraîcheur — assimilation et récupération",
    };
    
    if (phase === "Base") {
      const footingLib1 = selectSession("FOOTING", phase, weekInPhase, totalWeeksInPhase);
      const footingLib2 = selectSession("FOOTING", phase, Math.max(1, weekInPhase - 1), totalWeeksInPhase);
      const slLib = selectSession("SORTIE_LONGUE", phase, weekInPhase, totalWeeksInPhase);
      sessions = [
        footingLib1
          ? buildSessionFromLibrary(footingLib1, Math.round(kmPerSession * 0.9), paces, "FOOTING")
          : {
              type: "EF", title: "Footing endurance", duration: "45-50min",
              distance: Math.round(kmPerSession * 0.9),
              warmup: { duration: "10min", pace: easyPace, description: "Début très progressif" },
              main: [{ description: "Course continue en aisance respiratoire", duration: "30-35min", pace: easyPace }],
              cooldown: { duration: "5min", pace: easyPace, description: "Retour au calme + étirements" },
              notes: "Vous devez pouvoir tenir une conversation. Si vous êtes essoufflé, ralentissez.",
            },
        footingLib2
          ? buildSessionFromLibrary(footingLib2, Math.round(kmPerSession * 0.9), paces, "FOOTING")
          : {
              type: "EF", title: "Footing + gammes", duration: "50min",
              distance: Math.round(kmPerSession * 0.9),
              warmup: { duration: "15min", pace: easyPace, description: "Footing progressif" },
              main: [
                { description: "Footing en endurance", duration: "25min", pace: easyPace },
                { description: "Gammes techniques : montées de genoux, talons-fesses, griffés", duration: "5min", pace: "—" },
                { description: "4 × 100m en accélération progressive", duration: "5min", pace: "Progressif" },
              ],
              cooldown: { duration: "5min", pace: easyPace, description: "Trot léger" },
              notes: "Les accélérations servent à activer les fibres rapides sans fatigue.",
            },
        slLib
          ? buildSessionFromLibrary(slLib, Math.round(kmPerSession * 1.6), paces, "SORTIE_LONGUE")
          : {
              type: "SL", title: "Sortie longue", duration: "1h15-1h30",
              distance: Math.round(kmPerSession * 1.6),
              warmup: { duration: "—", pace: "—", description: "Pas d'échauffement spécifique" },
              main: [{ description: "Course continue, départ lent puis allure stable", duration: "1h15-1h30", pace: easyPace }],
              cooldown: { duration: "5min", pace: easyPace, description: "Marche + étirements" },
              notes: "Emportez de l'eau si >1h. Restez en zone confortable tout du long.",
            },
      ];
      if (sessionsPerWeek >= 4) {
        sessions.push({
          type: "RECUP", title: "Footing récupération", duration: "30-35min",
          distance: Math.round(kmPerSession * 0.6),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [{ description: "Footing très lent, récupération active", duration: "30-35min", pace: easyPace }],
          cooldown: { duration: "5min", pace: "—", description: "Marche + étirements doux" },
          notes: "Récupération active. Privilégiez le repos si fatigue.",
        });
      }
      if (sessionsPerWeek >= 5) {
        const footingLib5 = selectSession("FOOTING", phase, Math.min(weekInPhase + 1, totalWeeksInPhase), totalWeeksInPhase);
        sessions.push(
          footingLib5
            ? buildSessionFromLibrary(footingLib5, Math.round(kmPerSession * 0.8), paces, "FOOTING")
            : {
                type: "EF", title: "Footing aérobie", duration: "40-45min",
                distance: Math.round(kmPerSession * 0.8),
                warmup: { duration: "10min", pace: easyPace, description: "Début progressif" },
                main: [{ description: "Course continue en endurance", duration: "30min", pace: easyPace }],
                cooldown: { duration: "5min", pace: easyPace, description: "Retour au calme" },
                notes: "Séance de volume facile pour compléter la semaine.",
              }
        );
      }
      if (sessionsPerWeek >= 6) {
        sessions.push({
          type: "EF", title: "Footing + côtes légères", duration: "40-45min",
          distance: Math.round(kmPerSession * 0.7),
          warmup: { duration: "15min", pace: easyPace, description: "Footing tranquille" },
          main: [{ description: "Footing vallonné ou 6 × 30s en côte légère", duration: "20min", pace: easyPace }],
          cooldown: { duration: "5min", pace: easyPace, description: "Trot retour au calme" },
          notes: "Renforcement musculaire naturel. Pas de sprint, gardez le contrôle.",
        });
      }
    } else if (phase === "Construction") {
      const seuilLib = selectSession("SEUIL2", phase, weekInPhase, totalWeeksInPhase);
      const slLib = selectSession("SORTIE_LONGUE", phase, weekInPhase, totalWeeksInPhase);
      const footingLib = selectSession("FOOTING", phase, weekInPhase, totalWeeksInPhase);
      sessions = [
        seuilLib
          ? buildSessionFromLibrary(seuilLib, Math.round(kmPerSession * 1.0), paces, "SEUIL2")
          : {
              type: "SEUIL", title: "Seuil intervalles", duration: "55-60min",
              distance: Math.round(kmPerSession * 1.0),
              warmup: { duration: "15min", pace: easyPace, description: "Footing + 3 accélérations" },
              main: [
                { description: "3 × 10min @ allure seuil", duration: "30min", pace: seuilPace },
                { description: "Récupération entre les blocs : 3min trot", duration: "6min", pace: easyPace },
              ],
              cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme progressif" },
              notes: "Allure seuil = inconfortable mais tenable. Respirez en 3 temps.",
            },
        footingLib
          ? buildSessionFromLibrary(footingLib, Math.round(kmPerSession * 0.7), paces, "FOOTING")
          : {
              type: "EF", title: "Footing récupération", duration: "40-45min",
              distance: Math.round(kmPerSession * 0.7),
              warmup: { duration: "—", pace: "—", description: "—" },
              main: [{ description: "Footing facile, récupération de la veille", duration: "40-45min", pace: easyPace }],
              cooldown: { duration: "5min", pace: "—", description: "Étirements" },
              notes: "Jour de récupération. Vraiment facile.",
            },
        slLib
          ? buildSessionFromLibrary(slLib, Math.round(kmPerSession * 1.7), paces, "SORTIE_LONGUE")
          : {
              type: "SL", title: "Sortie longue progressive", duration: "1h30-1h45",
              distance: Math.round(kmPerSession * 1.7),
              warmup: { duration: "—", pace: "—", description: "—" },
              main: [
                { description: "1h en endurance fondamentale", duration: "1h", pace: easyPace },
                { description: "20-30min en progression vers allure marathon", duration: "25min", pace: tempoPace },
              ],
              cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
              notes: "Finir en accélérant apprend au corps à performer sur fatigue.",
            },
      ];
      if (sessionsPerWeek >= 4) {
        sessions.push({
          type: "EF", title: "Footing aérobie", duration: "40min",
          distance: Math.round(kmPerSession * 0.6),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [{ description: "Footing facile", duration: "40min", pace: easyPace }],
          cooldown: { duration: "—", pace: "—", description: "Étirements" },
          notes: "Séance de volume facile pour compléter la semaine.",
        });
      }
      if (sessionsPerWeek >= 5) {
        const vmaLib = selectSession("VMA_COURTE", phase, weekInPhase, totalWeeksInPhase);
        sessions.push(
          vmaLib
            ? buildSessionFromLibrary(vmaLib, Math.round(kmPerSession * 0.9), paces, "VMA_COURTE")
            : {
                type: "VMA", title: "VMA courte", duration: "50-55min",
                distance: Math.round(kmPerSession * 0.9),
                warmup: { duration: "20min", pace: easyPace, description: "Footing + gammes + lignes droites" },
                main: [
                  { description: "10 × 300m @ allure VMA", duration: "15min effort", pace: vmaPace },
                  { description: "Récupération : 1min trot entre chaque", duration: "—", pace: easyPace },
                ],
                cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
                notes: "Régularité > vitesse. Chaque répétition au même temps.",
              }
        );
      }
      if (sessionsPerWeek >= 6) {
        sessions.push({
          type: "EF", title: "Footing endurance + renforcement", duration: "45min",
          distance: Math.round(kmPerSession * 0.6),
          warmup: { duration: "10min", pace: easyPace, description: "Footing tranquille" },
          main: [
            { description: "Footing en endurance", duration: "25min", pace: easyPace },
            { description: "Circuit PPG : gainage, squats, fentes (3 séries)", duration: "10min", pace: "—" },
          ],
          cooldown: { duration: "5min", pace: "—", description: "Étirements" },
          notes: "Le renforcement prévient les blessures. Ne négligez pas cette séance.",
        });
      }
    } else if (phase === "Spécifique") {
      const tempoLib = selectSession("TEMPO", phase, weekInPhase, totalWeeksInPhase);
      const slLib = selectSession("SORTIE_LONGUE", phase, weekInPhase, totalWeeksInPhase);
      const footingLib = selectSession("FOOTING", phase, weekInPhase, totalWeeksInPhase);
      sessions = [
        tempoLib
          ? buildSessionFromLibrary(tempoLib, Math.round(kmPerSession * 1.1), paces, "TEMPO")
          : {
              type: "TEMPO", title: "Tempo allure objectif",
              duration: `${Math.round(kmPerSession * 1.1 * 5)}min`,
              distance: Math.round(kmPerSession * 1.1),
              warmup: { duration: "15min", pace: easyPace, description: "Footing + 4 accélérations" },
              main: [
                { description: "2 × 15min @ allure objectif", duration: "30min", pace: tempoPace },
                { description: "Récupération : 3min trot", duration: "3min", pace: easyPace },
              ],
              cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
              notes: "Allure cible de votre objectif. Mémorisez les sensations.",
            },
        footingLib
          ? buildSessionFromLibrary(footingLib, Math.round(kmPerSession * 0.6), paces, "FOOTING")
          : {
              type: "EF", title: "Footing récupération",
              duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`,
              distance: Math.round(kmPerSession * 0.6),
              warmup: { duration: "—", pace: "—", description: "—" },
              main: [{ description: "Footing très facile", duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`, pace: easyPace }],
              cooldown: { duration: "5min", pace: "—", description: "Étirements" },
              notes: "Récupération impérative après le tempo.",
            },
        slLib
          ? buildSessionFromLibrary(slLib, Math.round(kmPerSession * 1.9), paces, "SORTIE_LONGUE")
          : {
              type: "SL", title: "Sortie longue spécifique",
              duration: `${Math.round(kmPerSession * 1.9 * 5.5)}min`,
              distance: Math.round(kmPerSession * 1.9),
              warmup: { duration: "—", pace: "—", description: "—" },
              main: [
                { description: "Première partie en endurance", duration: `${Math.round(kmPerSession * 0.8 * 5.5)}min`, pace: easyPace },
                { description: "Bloc @ allure objectif", duration: `${Math.round(kmPerSession * 0.8 * 5.5)}min`, pace: tempoPace },
                { description: "Retour en endurance", duration: `${Math.round(kmPerSession * 0.3 * 5.5)}min`, pace: easyPace },
              ],
              cooldown: { duration: "10min", pace: easyPace, description: "Marche + étirements" },
              notes: "Séance clé. Simule les conditions de course sur fatigue.",
            },
      ];
      if (sessionsPerWeek >= 4) {
        sessions.push({
          type: "EF", title: "Décrassage",
          duration: `${Math.round(kmPerSession * 0.4 * 5.5)}min`,
          distance: Math.round(kmPerSession * 0.4),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [{ description: "Footing très léger", duration: `${Math.round(kmPerSession * 0.4 * 5.5)}min`, pace: easyPace }],
          cooldown: { duration: "—", pace: "—", description: "Étirements complets" },
          notes: "Repos complet si fatigue importante.",
        });
      }
      if (sessionsPerWeek >= 5) {
        const seuilLib = selectSession("SEUIL2", phase, weekInPhase, totalWeeksInPhase);
        sessions.push(
          seuilLib
            ? buildSessionFromLibrary(seuilLib, Math.round(kmPerSession * 0.9), paces, "SEUIL2")
            : {
                type: "SEUIL", title: "Rappel seuil",
                duration: `${Math.round(kmPerSession * 0.9 * 5)}min`,
                distance: Math.round(kmPerSession * 0.9),
                warmup: { duration: "15min", pace: easyPace, description: "Footing + gammes" },
                main: [
                  { description: "2 × 12min @ allure seuil", duration: "24min", pace: seuilPace },
                  { description: "Récupération : 3min trot", duration: "3min", pace: easyPace },
                ],
                cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
                notes: "Maintien de la capacité seuil en phase spécifique.",
              }
        );
      }
      if (sessionsPerWeek >= 6) {
        sessions.push({
          type: "EF", title: "Footing aérobie",
          duration: `${Math.round(kmPerSession * 0.5 * 5.5)}min`,
          distance: Math.round(kmPerSession * 0.5),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [{ description: "Footing facile", duration: `${Math.round(kmPerSession * 0.5 * 5.5)}min`, pace: easyPace }],
          cooldown: { duration: "5min", pace: "—", description: "Étirements" },
          notes: "Volume facile. Écoutez votre corps, cette semaine est intense.",
        });
      }
    } else if (phase === "Affûtage") {
      const footingLib = selectSession("FOOTING", phase, weekInPhase, totalWeeksInPhase);
      const tempoLib = selectSession("TEMPO", phase, weekInPhase, totalWeeksInPhase);
      sessions = [
        footingLib
          ? buildSessionFromLibrary(footingLib, Math.round(kmPerSession * 0.7), paces, "FOOTING")
          : {
              type: "EF", title: "Footing + rappels",
              duration: `${Math.round(kmPerSession * 0.7 * 5.5)}min`,
              distance: Math.round(kmPerSession * 0.7),
              warmup: { duration: "10min", pace: easyPace, description: "Footing tranquille" },
              main: [
                { description: "Footing facile", duration: `${Math.round(kmPerSession * 0.5 * 5.5)}min`, pace: easyPace },
                { description: "5 × 100m @ allure 5km", duration: "5min", pace: vmaPace },
              ],
              cooldown: { duration: "5min", pace: easyPace, description: "Trot léger" },
              notes: "Garder les jambes vives sans accumuler de fatigue.",
            },
        tempoLib
          ? buildSessionFromLibrary(tempoLib, Math.round(kmPerSession * 0.8), paces, "TEMPO")
          : {
              type: "TEMPO", title: "Rappel allure objectif",
              duration: `${Math.round(kmPerSession * 0.8 * 5)}min`,
              distance: Math.round(kmPerSession * 0.8),
              warmup: { duration: "15min", pace: easyPace, description: "Footing + 3 accélérations" },
              main: [
                { description: "2 × 8min @ allure objectif", duration: "16min", pace: tempoPace },
                { description: "Récupération : 3min trot", duration: "3min", pace: easyPace },
              ],
              cooldown: { duration: "10min", pace: easyPace, description: "Retour au calme" },
              notes: "Dernière séance de qualité. Sensations, pas chrono.",
            },
        {
          type: "EF", title: "Veille de course",
          duration: `${Math.round(kmPerSession * 0.5 * 5.5)}min`,
          distance: Math.round(kmPerSession * 0.5),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [
            { description: "Footing très léger", duration: "15min", pace: easyPace },
            { description: "3 × 30s @ allure course (activation)", duration: "5min", pace: tempoPace },
          ],
          cooldown: { duration: "5min", pace: "—", description: "Marche" },
          notes: "Juste une activation. Couchez-vous tôt, hydratez-vous bien.",
        },
      ];
      if (sessionsPerWeek >= 4) {
        sessions.push({
          type: "EF", title: "Footing léger",
          duration: `${Math.round(kmPerSession * 0.4 * 5.5)}min`,
          distance: Math.round(kmPerSession * 0.4),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [{ description: "Footing très facile", duration: `${Math.round(kmPerSession * 0.4 * 5.5)}min`, pace: easyPace }],
          cooldown: { duration: "5min", pace: "—", description: "Étirements doux" },
          notes: "Garder le rythme sans fatigue. Repos si besoin.",
        });
      }
      if (sessionsPerWeek >= 5) {
        sessions.push({
          type: "RECUP", title: "Décrassage", duration: "25-30min",
          distance: Math.round(kmPerSession * 0.3),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [{ description: "Trot très léger, récupération active", duration: "25min", pace: easyPace }],
          cooldown: { duration: "5min", pace: "—", description: "Marche" },
          notes: "Juste bouger les jambes. Aucune intensité.",
        });
      }
      if (sessionsPerWeek >= 6) {
        sessions.push({
          type: "EF", title: "Footing activation", duration: "20-25min",
          distance: Math.round(kmPerSession * 0.3),
          warmup: { duration: "—", pace: "—", description: "—" },
          main: [{ description: "Footing court + 3 × 20s vif", duration: "20min", pace: easyPace }],
          cooldown: { duration: "5min", pace: "—", description: "Marche" },
          notes: "Activation légère. La fraîcheur est la priorité absolue.",
        });
      }
    }

    // Smart session-to-day assignment
    // Rules:
    //   1. Sortie longue (SL) → preferably Sam or Dim
    //   2. No two quality sessions (SEUIL/VMA/TEMPO) on adjacent days
    //   3. No quality session the day before a long run
    const QUALITY_TYPES = new Set(["SEUIL", "VMA", "TEMPO"]);
    const sortedDays = [...trainingDays].sort((a, b) => (dayOffsets[a] || 0) - (dayOffsets[b] || 0));
    const daySlots = sortedDays.map(d => ({ dayName: d, offset: dayOffsets[d] || 0, session: null }));

    // Step 1: Place SL on weekend (Sam/Dim) if available
    const slSessions = sessions.filter(s => s.type === "SL");
    const otherSessions = sessions.filter(s => s.type !== "SL");
    const weekendSlots = daySlots.filter(d => d.dayName === "Sam" || d.dayName === "Dim");
    const nonWeekendSlots = daySlots.filter(d => d.dayName !== "Sam" && d.dayName !== "Dim");

    slSessions.forEach(sl => {
      const free = weekendSlots.find(d => !d.session);
      if (free) {
        free.session = sl;
      } else {
        // Fallback: place on last available slot
        const fallback = [...daySlots].reverse().find(d => !d.session);
        if (fallback) fallback.session = sl;
      }
    });

    // Step 2: Place quality sessions with spacing constraints
    const qualitySessions = otherSessions.filter(s => QUALITY_TYPES.has(s.type));
    const easySessions = otherSessions.filter(s => !QUALITY_TYPES.has(s.type));

    const emptySlots = () => daySlots.filter(d => !d.session);
    const isAdjacentToQualityOrSL = (slot) => {
      return daySlots.some(d => d.session &&
        (QUALITY_TYPES.has(d.session.type) || d.session.type === "SL") &&
        Math.abs(d.offset - slot.offset) === 1
      );
    };

    qualitySessions.forEach(qs => {
      // Prefer slot not adjacent to another quality/SL session
      const safe = emptySlots().find(d => !isAdjacentToQualityOrSL(d));
      if (safe) {
        safe.session = qs;
      } else {
        const fallback = emptySlots()[0];
        if (fallback) fallback.session = qs;
      }
    });

    // Step 3: Fill remaining with easy sessions
    easySessions.forEach(es => {
      const slot = emptySlots()[0];
      if (slot) slot.session = es;
    });

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

    // Already sorted chronologically since daySlots was sorted

    // Adjust for assimilation weeks
    if (isAssim) {
      sessions = sessions.map(s => ({
        ...s,
        distance: Math.round(s.distance * 0.75),
        notes: (s.notes || "") + " Semaine allégée : écoutez votre corps.",
      }));
    }

    // Convert session distances to ranges: base → base to base+1
    sessions = sessions.map(s => {
      const base = s.distance;
      return {
        ...s,
        distance: { low: Math.max(1, base), high: Math.max(1, base + 1) },
      };
    });

    // Weekly range: min(5km, 10% of total) spread
    const totalBase = sessions.reduce((sum, s) => sum + s.distance.low, 0);
    const weekSpread = Math.min(5, Math.round(totalBase * 0.1));
    const totalLow = totalBase;
    const totalHigh = totalBase + weekSpread;

    // Build full week with rest days (Mon→Sun)
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

// Format distance range for display
function fmtDist(d) {
  if (typeof d === "number") return `${d}`;
  if (d && d.low !== undefined) return d.low === d.high ? `${d.low}` : `${d.low}-${d.high}`;
  return "—";
}

// Get the midpoint of a distance (for proportional display)
function distMid(d) {
  if (typeof d === "number") return d;
  if (d && d.low !== undefined) return (d.low + d.high) / 2;
  return 0;
}

// Mini volume chart for week view
function WeekVolumeBar({ sessions }) {
  const trainingSessions = sessions.filter(s => !s.isRest);
  const total = trainingSessions.reduce((sum, s) => sum + distMid(s.distance), 0);
  if (total === 0) return null;

  return (
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#eee" }}>
      {trainingSessions.map((s, i) => {
        const pct = (distMid(s.distance) / total) * 100;
        const color = SESSION_TYPES[s.type]?.color || "#ccc";
        return (
          <div key={i} style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? 2 : 0 }} />
        );
      })}
    </div>
  );
}

// Session detail modal
function SessionDetailModal({ session, paces, onClose }) {
  if (!session) return null;
  
  const sessionType = SESSION_TYPES[session.type] || SESSION_TYPES.EF;
  
  return (
    <div 
      style={{ 
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, 
        background: "rgba(0,0,0,0.5)", 
        display: "flex", alignItems: "center", justifyContent: "center", 
        zIndex: 100,
        padding: 16,
      }} 
      onClick={onClose}
    >
      <div
        style={{
          background: "#fdfdfd",
          border: "2px solid #1a1a1a",
          borderRadius: 2,
          width: "100%",
          maxWidth: 440,
          maxHeight: "85vh",
          overflow: "auto",
          fontFamily: FONT,
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          padding: "14px 16px", 
          borderBottom: "2px solid #1a1a1a",
          background: sessionType.color,
        }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
            {session.dateFormatted}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>
            {session.title}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>
              ⏱ {session.duration}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>
              📍 {fmtDist(session.distance)} km
            </span>
          </div>
        </div>
        
        {/* Content */}
        <div style={{ padding: 16 }}>
          {/* Warmup */}
          {session.warmup && session.warmup.duration !== "—" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ 
                fontSize: 10, fontWeight: 700, color: "#888", 
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 
              }}>
                Échauffement
              </div>
              <div style={{ 
                padding: 10, background: "#f8f8f8", borderRadius: 2,
                borderLeft: "3px solid #7ec8e3",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  {session.warmup.duration}
                  {session.warmup.pace !== "—" && (
                    <span style={{ fontWeight: 400, color: "#888", marginLeft: 8 }}>
                      @ {session.warmup.pace} /km
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {session.warmup.description}
                </div>
              </div>
            </div>
          )}
          
          {/* Main */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ 
              fontSize: 10, fontWeight: 700, color: "#888", 
              textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 
            }}>
              Corps de séance
            </div>
            {session.main.map((block, i) => (
              <div 
                key={i}
                style={{ 
                  padding: 10, background: "#fff", borderRadius: 2,
                  borderLeft: `3px solid ${sessionType.color}`,
                  marginBottom: 6,
                  border: "1px solid #eee",
                  borderLeftWidth: 3,
                  borderLeftColor: sessionType.color,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, wordBreak: "break-word" }}>
                  {block.description}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#888", flexWrap: "wrap" }}>
                  {block.duration && <span>⏱ {block.duration}</span>}
                  {block.pace && block.pace !== "—" && <span>🏃 {block.pace}/km</span>}
                </div>
              </div>
            ))}
          </div>
          
          {/* Cooldown */}
          {session.cooldown && session.cooldown.duration !== "—" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ 
                fontSize: 10, fontWeight: 700, color: "#888", 
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 
              }}>
                Retour au calme
              </div>
              <div style={{ 
                padding: 10, background: "#f8f8f8", borderRadius: 2,
                borderLeft: "3px solid #9e9e9e",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  {session.cooldown.duration}
                  {session.cooldown.pace !== "—" && (
                    <span style={{ fontWeight: 400, color: "#888", marginLeft: 8 }}>
                      @ {session.cooldown.pace} /km
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {session.cooldown.description}
                </div>
              </div>
            </div>
          )}
          
          {/* Notes */}
          {session.notes && (
            <div style={{
              padding: 10, background: "#fffbeb", borderRadius: 2,
              border: "1px solid #f0e6c0",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#8a7a3a",
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 4
              }}>
                💡 Conseils
              </div>
              <div style={{ fontSize: 12, color: "#5a5030", lineHeight: 1.5 }}>
                {session.notes}
              </div>
            </div>
          )}

          {/* Coach tips */}
          {session.coach_tips && session.coach_tips.length > 0 && (
            <div style={{
              padding: 10, background: "#e8f5e9", borderRadius: 2,
              border: "1px solid #c8e6c9", marginTop: 10,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#2e7d32",
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
              }}>
                Conseils du coach
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#1b5e20", lineHeight: 1.6 }}>
                {(Array.isArray(session.coach_tips) ? session.coach_tips : [session.coach_tips]).map((tip, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #eee", textAlign: "right" }}>
          <button style={s.btn} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// Global plan overview mini-chart
function PlanOverviewChart({ weeklyPlan, currentWeek, onWeekClick }) {
  if (!weeklyPlan || weeklyPlan.length === 0) return null;
  
  const maxVol = Math.max(...weeklyPlan.map(w => w.volume));
  const chartHeight = 60;
  
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ 
        display: "flex", alignItems: "flex-end", gap: 2, 
        height: chartHeight, 
        padding: "0 2px",
      }}>
        {weeklyPlan.map((w, i) => {
          const h = (w.volume / maxVol) * chartHeight;
          const color = PHASE_COLORS[w.phase] || "#ccc";
          const isActive = w.week === currentWeek;
          
          return (
            <div
              key={i}
              onClick={() => onWeekClick(w.week)}
              style={{
                flex: 1,
                height: h,
                background: isActive ? "#1a1a1a" : color,
                borderRadius: "2px 2px 0 0",
                cursor: "pointer",
                opacity: w.isAssim ? 0.5 : 0.85,
                border: isActive ? "2px solid #1a1a1a" : "none",
                boxSizing: "border-box",
                transition: "all 0.15s ease",
              }}
              title={`S${w.week} — ${w.volume}km`}
            />
          );
        })}
      </div>
      {/* Phase labels */}
      <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
        {(() => {
          // Group by phase
          const groups = [];
          let current = null;
          weeklyPlan.forEach((w, i) => {
            if (!current || current.phase !== w.phase) {
              current = { phase: w.phase, count: 1, start: i };
              groups.push(current);
            } else {
              current.count++;
            }
          });
          return groups.map((g, i) => (
            <div 
              key={i} 
              style={{ 
                flex: g.count, 
                fontSize: 8, 
                textAlign: "center",
                color: "#888",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {g.count >= 3 ? g.phase : ""}
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

function PlanScreen({ plan, paces, profile, availability }) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const weeklyPlan = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const toMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + toMon);
    monday.setHours(0, 0, 0, 0);
    return generateWeeklyPlan(plan, availability, paces, monday);
  }, [plan, availability, paces]);
  
  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      await generatePlanPDF(weeklyPlan, plan, profile, availability, paces);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Erreur lors de l\'export PDF');
    }
    setIsExporting(false);
  };
  
  if (weeklyPlan.length === 0) {
    return (
      <div>
        <div style={s.sectionTitle}>Votre plan détaillé</div>
        <div style={{ color: "#c00", fontSize: 13, padding: 12, border: "1px solid #c00", borderRadius: 2 }}>
          Impossible de générer le plan détaillé.
        </div>
      </div>
    );
  }
  
  const currentWeekData = weeklyPlan.find(w => w.week === selectedWeek) || weeklyPlan[0];
  const objective = plan?.cycles?.[0]?.objective;
  
  const formatDateRange = (start, end) => {
    const s = start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const e = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${s} — ${e}`;
  };
  
  return (
    <div>
      <div style={s.sectionTitle}>Votre plan semaine par semaine</div>
      
      {/* Plan header */}
      <div style={{ 
        padding: 12, background: "#1a1a1a", color: "#fff", 
        borderRadius: 2, marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          {objective ? `Préparation ${objective.distance}` : "Plan d'entraînement"}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
          {weeklyPlan.length} sem. · {availability.sessionsPerWeek} séances/sem. · ~{Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.low || w.volume), 0))}-{Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.high || w.volume), 0))}&nbsp;km
        </div>
      </div>
      
      {/* Global plan overview (mini chart) */}
      <div style={{ 
        padding: 12, background: "#f8f8f8", borderRadius: 2, 
        border: "1px solid #eee", marginBottom: 16,
      }}>
        <div style={{ 
          fontSize: 10, fontWeight: 700, color: "#888", 
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 
        }}>
          Vue globale — progression du volume
        </div>
        <PlanOverviewChart 
          weeklyPlan={weeklyPlan} 
          currentWeek={selectedWeek} 
          onWeekClick={setSelectedWeek} 
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          {Object.entries(PHASE_COLORS).map(([phase, color]) => (
            <div key={phase} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 1, background: color }} />
              <span style={{ fontSize: 10, color: "#666" }}>{phase}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Week selector (horizontal scroll) */}
      <div style={{ 
        display: "flex", gap: 6, overflowX: "auto", 
        paddingBottom: 8, marginBottom: 16,
        scrollbarWidth: "none",
      }}>
        {weeklyPlan.map((w) => {
          const isActive = w.week === selectedWeek;
          const phaseColor = PHASE_COLORS[w.phase] || "#888";
          return (
            <button
              key={w.week}
              onClick={() => setSelectedWeek(w.week)}
              style={{
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                padding: "6px 10px",
                border: isActive ? "2px solid #1a1a1a" : "1px solid #ddd",
                borderRadius: 2,
                background: isActive ? "#1a1a1a" : "#fff",
                color: isActive ? "#fff" : "#1a1a1a",
                cursor: "pointer",
                flexShrink: 0,
                position: "relative",
              }}
            >
              S{w.week}
              <div style={{
                position: "absolute",
                bottom: 2,
                left: "50%",
                transform: "translateX(-50%)",
                width: 4,
                height: 4,
                borderRadius: 2,
                background: isActive ? "#fff" : phaseColor,
                opacity: w.isAssim ? 0.4 : 1,
              }} />
            </button>
          );
        })}
      </div>
      
      {/* Selected week detail */}
      <div style={{ 
        border: "2px solid #1a1a1a", 
        borderRadius: 2,
        marginBottom: 16,
      }}>
        {/* Week header */}
        <div style={{
          padding: "10px 12px",
          background: PHASE_COLORS[currentWeekData.phase] || "#888",
          borderBottom: "2px solid #1a1a1a",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
                {formatDateRange(currentWeekData.weekStartDate, currentWeekData.weekEndDate)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                Semaine {currentWeekData.week}
                {currentWeekData.isAssim && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, marginLeft: 6,
                    padding: "2px 5px",
                    border: "1px dashed rgba(255,255,255,0.6)",
                    borderRadius: 2,
                  }}>
                    ASSIMILATION
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentWeekData.phase} — {currentWeekData.objective}
              </div>
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
                {fmtDist(currentWeekData.totalDistance)}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>km</div>
            </div>
          </div>
          
          {/* Volume distribution bar */}
          <div style={{ marginTop: 10 }}>
            <WeekVolumeBar sessions={currentWeekData.sessions} />
          </div>
        </div>
        
        {/* Sessions list */}
        <div>
          {currentWeekData.sessions.map((session, si) => {
            if (session.isRest) {
              return (
                <div
                  key={si}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: "8px 10px",
                    borderBottom: si < currentWeekData.sessions.length - 1 ? "1px solid #eee" : "none",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ width: 56, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "#bbb", textTransform: "capitalize" }}>
                      {session.date.toLocaleDateString("fr-FR", { weekday: "short" })}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, color: "#bbb" }}>
                      {session.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <div style={{
                    width: 3, height: 28,
                    background: "#e0e0e0",
                    borderRadius: 2,
                    marginRight: 10,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, fontFamily: FONT, color: "#bbb", fontStyle: "italic" }}>
                      Jour off
                    </div>
                  </div>
                </div>
              );
            }
            const sessionType = SESSION_TYPES[session.type] || SESSION_TYPES.EF;
            return (
              <div
                key={si}
                onClick={() => setSelectedSession(session)}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "10px 10px",
                  borderBottom: si < currentWeekData.sessions.length - 1 ? "1px solid #eee" : "none",
                  cursor: "pointer",
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f8f8f8"}
                onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
              >
                {/* Date */}
                <div style={{ width: 56, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "#888", textTransform: "capitalize" }}>
                    {session.date.toLocaleDateString("fr-FR", { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
                    {session.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </div>
                </div>

                {/* Type indicator */}
                <div style={{
                  width: 3, height: 32,
                  background: sessionType.color,
                  borderRadius: 2,
                  marginRight: 10,
                  flexShrink: 0,
                }} />

                {/* Session info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, fontFamily: FONT,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {session.title}
                  </div>
                  <div style={{ fontSize: 10, color: "#888" }}>
                    {session.duration} · {sessionType.short}
                  </div>
                </div>

                {/* Distance + arrow */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontWeight: 700, fontSize: 12, fontFamily: FONT }}>
                      {fmtDist(session.distance)}
                    </span>
                    <span style={{ fontSize: 9, color: "#888" }}>km</span>
                  </div>
                  <span style={{ color: "#ccc", fontSize: 12 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Week summary footer */}
        <div style={{
          padding: "8px 10px",
          background: "#f8f8f8",
          borderTop: "1px solid #eee",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "#888", fontFamily: FONT }}>
            {currentWeekData.sessions.filter(s => !s.isRest).length} séances
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, whiteSpace: "nowrap" }}>
            Total : {fmtDist(currentWeekData.totalDistance)} km
          </span>
        </div>
      </div>
      
      {/* Phase explanations */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...s.sectionTitle, marginTop: 28, fontSize: 13 }}>Comprendre les 4 phases</div>
        <div>
          {["Base", "Construction", "Spécifique", "Affûtage"].map((phase) => {
            const info = PHASE_DESCRIPTIONS[phase];
            const color = PHASE_COLORS[phase];
            return (
              <div key={phase} style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                <div style={{ width: 4, height: 44, background: color, borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT }}>
                    <span style={{ marginRight: 6 }}>{info.icon}</span>
                    {info.title}
                    <span style={{ fontWeight: 400, fontSize: 11, color: "#888", marginLeft: 8 }}>{info.subtitle}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5, marginTop: 2 }}>{info.desc}</div>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <div style={{ width: 4, height: 20, border: "1.5px dashed #aaa", borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
            <div>
              <span style={{ fontWeight: 700, fontSize: 12, fontFamily: FONT }}>↓ Assimilation</span>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Semaines de décharge pour absorber la charge</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Export / actions */}
      <div style={{ 
        padding: 16, 
        background: "#f8f8f0", 
        border: "2px solid #1a1a1a", 
        borderRadius: 2,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT, marginBottom: 8 }}>
          ✓ Plan prêt
        </div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 12 }}>
          Cliquez sur une séance pour voir le détail complet avec échauffement, corps de séance, retour au calme et allures cibles.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button 
            data-export-pdf
            style={{ ...s.btn, opacity: isExporting ? 0.6 : 1 }} 
            onClick={handleExportPDF}
            disabled={isExporting}
          >
            {isExporting ? "Export en cours..." : "Exporter PDF"}
          </button>
        </div>
      </div>
      
      {/* Session detail modal */}
      {selectedSession && (
        <SessionDetailModal 
          session={selectedSession} 
          paces={paces}
          onClose={() => setSelectedSession(null)} 
        />
      )}
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────

const ONBOARDING_STEPS = ["Profil", "Historique", "Disponibilité", "Objectifs", "Résumé"];
const PLAN_STEPS = ["Allures", "Plan"];

const STORAGE_KEY = "runplanner_state";

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

export default function App() {
  const saved = useRef(loadSavedState()).current;

  const [phase, setPhase] = useState(saved?.phase || "onboarding");
  const [step, setStep] = useState(saved?.step || 0);
  const [planStep, setPlanStep] = useState(saved?.planStep || 0);

  const [profile, setProfile] = useState(saved?.profile || { firstName: "", lastName: "", birthDate: "", gender: "", refDistance: "", refTime: "" });
  const [history, setHistory] = useState(saved?.history || { yearKm: "", avgWeekKm: "", lastWeekKm: "" });
  const [availability, setAvailability] = useState(saved?.availability || { sessionsPerWeek: 4, trainingDays: ["Mar", "Jeu", "Sam"] });
  const [objectives, setObjectives] = useState(saved?.objectives || []);
  const [paces, setPaces] = useState(saved?.paces || null);
  const [plan, setPlan] = useState(saved?.plan || null);

  // Persist state to localStorage on every change
  useEffect(() => {
    saveState({ phase, step, planStep, profile, history, availability, objectives, paces, plan });
  }, [phase, step, planStep, profile, history, availability, objectives, paces, plan]);

  const initPaces = () => {
    if (profile.refDistance && profile.refTime) {
      const vdot = computeVDOT(DISTANCE_METERS[profile.refDistance] || 10000, parseTimeToSeconds(profile.refTime || "40:00"));
      return computeAllPaces(vdot);
    }
    return computeAllPaces(45);
  };

  const handleValidate = () => {
    setPaces(initPaces());

    // Build periodization plan — start on next Monday
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + daysUntilMonday);
    startDate.setHours(0, 0, 0, 0);
    const onboarding = {
      yearKm: history.yearKm,
      avg4wKm: history.avgWeekKm,
      lastWeekKm: history.lastWeekKm,
    };
    const builtPlan = buildPlan(startDate, objectives, onboarding);
    setPlan(builtPlan);

    setPhase("plan");
    setPlanStep(0);
  };

  const handleBackToSettings = () => {
    setPhase("onboarding");
    setStep(4); // Go to Résumé step so user can review & edit
  };

  // ── Onboarding phase ──
  if (phase === "onboarding") {
    const totalSteps = ONBOARDING_STEPS.length;
    const progress = ((step + 1) / totalSteps) * 100;

    const renderStep = () => {
      switch (step) {
        case 0: return <ProfileStep data={profile} onChange={setProfile} />;
        case 1: return <HistoryStep data={history} onChange={setHistory} />;
        case 2: return <AvailabilityStep data={availability} onChange={setAvailability} />;
        case 3: return <ObjectivesStep objectives={objectives} onAdd={(o) => setObjectives([...objectives, o])} onDelete={(i) => setObjectives(objectives.filter((_, idx) => idx !== i))} />;
        case 4: return <Summary profile={profile} history={history} availability={availability} objectives={objectives} onEdit={(t) => setStep(t)} />;
        default: return null;
      }
    };

    return (
      <div style={s.app}>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
        <div style={{ ...s.progressBar, width: `${progress}%` }} />
        <div style={s.stepIndicator}>Étape {step + 1}/{totalSteps} — {ONBOARDING_STEPS[step]}</div>
        <div style={s.title}>Onboarding Coureur</div>
        <div style={s.subtitle}>Configuration du profil d'entraînement</div>
        {renderStep()}
        <div style={s.nav}>
          <button style={{ ...s.btn, visibility: step > 0 ? "visible" : "hidden" }} onClick={() => setStep(step - 1)}>← Retour</button>
          <span style={{ fontSize: 11, color: "#aaa" }}>{ONBOARDING_STEPS[step]}</span>
          {step < totalSteps - 1 ? (
            <button style={s.btnPrimary} onClick={() => setStep(step + 1)}>Suivant →</button>
          ) : (
            <button style={{ ...s.btnPrimary, background: "#2a6e2a", borderColor: "#2a6e2a" }} onClick={handleValidate}>Valider ✓</button>
          )}
        </div>
      </div>
    );
  }

  // ── Plan phase ──
  const totalPlanSteps = PLAN_STEPS.length;
  const planProgress = ((planStep + 1) / totalPlanSteps) * 100;

  const renderPlanStep = () => {
    switch (planStep) {
      case 0:
        return <PaceScreen profile={profile} paces={paces} onPacesChange={setPaces} />;
      case 1:
        return <PlanScreen plan={plan} paces={paces} profile={profile} availability={availability} />;
      default:
        return null;
    }
  };

  return (
    <div style={s.app}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={{ ...s.progressBar, width: `${planProgress}%` }} />
      <div style={s.stepIndicator}>Votre plan — {planStep + 1}/{totalPlanSteps} — {PLAN_STEPS[planStep]}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={s.title}>{profile.firstName ? `${profile.firstName}, votre plan` : "Votre plan"}</div>
        <button style={s.editBtn} onClick={handleBackToSettings}>Paramètres</button>
      </div>
      <div style={s.subtitle}>Personnalisé à partir de vos données</div>
      {renderPlanStep()}
      <div style={s.nav}>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button style={s.btn} onClick={handleBackToSettings}>Paramètres</button>
          {planStep > 0 && <button style={s.btn} onClick={() => setPlanStep(planStep - 1)}>← Retour</button>}
        </div>
        {planStep < totalPlanSteps - 1 ? (
          <button style={s.btnPrimary} onClick={() => setPlanStep(planStep + 1)}>Suivant →</button>
        ) : (
          <button style={{ ...s.btnPrimary, background: "#2a6e2a", borderColor: "#2a6e2a" }} onClick={() => {
            document.querySelector('[data-export-pdf]')?.click();
          }}>Export PDF</button>
        )}
      </div>
    </div>
  );
}
