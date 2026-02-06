// ── Coach Context Builder ─────────────────────────────────────────
// Builds a concise text summary (~400-600 tokens) from app state
// for the AI coach system prompt. Pure function, zero side effects.

import { formatPace } from './vdot';

/**
 * @param {Object} params
 * @param {Object} params.profile
 * @param {Object} params.history
 * @param {Object} params.availability
 * @param {Array}  params.objectives
 * @param {Object} params.paces
 * @param {Object} params.plan
 * @returns {string}
 */
export function buildCoachContext({ profile, history, availability, objectives, paces, plan }) {
  const lines = [];

  // ── Profil ──
  lines.push("## Profil");
  if (profile.firstName) lines.push(`Prénom : ${profile.firstName}`);
  if (profile.gender) lines.push(`Genre : ${profile.gender === "M" ? "Homme" : "Femme"}`);
  if (profile.birthDate) {
    const age = Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / 31557600000);
    lines.push(`Âge : ${age} ans`);
  }
  if (profile.refDistance && profile.refTime) {
    lines.push(`Performance de référence : ${profile.refDistance} en ${profile.refTime}`);
  }

  // ── Historique ──
  lines.push("\n## Historique d'entraînement");
  if (history.yearKm) lines.push(`Volume annuel : ~${history.yearKm} km/an`);
  if (history.avgWeekKm) lines.push(`Moyenne 4 semaines : ${history.avgWeekKm} km/sem`);
  if (history.lastWeekKm) lines.push(`Dernière semaine : ${history.lastWeekKm} km`);

  // ── Disponibilité ──
  lines.push("\n## Disponibilité");
  lines.push(`Séances/semaine : ${availability.sessionsPerWeek}`);
  if (availability.trainingDays?.length) {
    lines.push(`Jours : ${availability.trainingDays.join(", ")}`);
  }

  // ── Objectifs ──
  if (objectives?.length > 0) {
    lines.push("\n## Objectifs");
    objectives.forEach((o) => {
      const d = new Date(o.date).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric"
      });
      lines.push(`- ${o.distance} le ${d} (${o.type})`);
    });
  }

  // ── Allures clés ──
  if (paces) {
    lines.push("\n## Allures clés");
    const zones = ["Easy", "Tempo", "Seuil2", "VMACourte"];
    const parts = [];
    zones.forEach((z) => {
      if (paces[z]) {
        const label = paces[z].label || z;
        const slow = formatPace(paces[z].slow);
        const fast = formatPace(paces[z].fast);
        parts.push(`${label}: ${slow}-${fast}/km`);
      }
    });
    if (parts.length) lines.push(parts.join(" | "));
  }

  // ── Plan macro ──
  if (plan?.cycles?.length > 0) {
    lines.push("\n## Plan en cours");

    plan.cycles.forEach((cycle, ci) => {
      if (cycle.objective) {
        const objDate = new Date(cycle.objective.date).toLocaleDateString("fr-FR");
        lines.push(`Cycle ${ci + 1} : ${cycle.objective.distance} le ${objDate} (${cycle.objective.type})`);
      } else {
        lines.push(`Cycle ${ci + 1} : Entraînement continu`);
      }

      const vs = cycle.volumeSchedule;
      if (!vs?.length) return;

      lines.push(`Durée : ${vs.length} semaines`);

      // ── Identifier la semaine en cours ──
      let currentWeekIdx = 0;
      if (cycle.startDate) {
        const start = new Date(cycle.startDate);
        const daysSinceStart = Math.floor((Date.now() - start.getTime()) / 86400000);
        currentWeekIdx = Math.max(0, Math.min(Math.floor(daysSinceStart / 7), vs.length - 1));
      }

      const cw = vs[currentWeekIdx];
      lines.push(`\nSemaine actuelle : S${cw.week} (${cw.phase}, ${cw.volume} km)`);

      // ── Fenêtre ±1 semaine ──
      const fromIdx = Math.max(0, currentWeekIdx - 1);
      const toIdx = Math.min(vs.length - 1, currentWeekIdx + 1);

      lines.push("Détail semaines proches :");
      for (let i = fromIdx; i <= toIdx; i++) {
        const w = vs[i];
        const marker = i === currentWeekIdx ? " ← CETTE SEMAINE" : "";
        const flags = [];
        if (w.isAssim) flags.push("assimilation");
        if (w.isRecovery) flags.push("récup");
        const flagStr = flags.length ? ` (${flags.join(", ")})` : "";
        lines.push(`  S${w.week} : ${w.phase}, ${w.volume} km${flagStr}${marker}`);
      }

      // ── Résumé des phases ──
      const phases = {};
      vs.forEach((w) => {
        if (!phases[w.phase]) phases[w.phase] = 0;
        phases[w.phase]++;
      });
      lines.push("\nPhases : " + Object.entries(phases).map(([p, n]) => `${p} (${n} sem)`).join(" → "));
    });
  }

  return lines.join("\n");
}
