import { selectSession, buildSessionFromLibrary } from './sessionResolver';
import { formatPace } from './vdot';
import { PHASE_COLORS, SESSION_TYPES, DAYS_LIST } from '../data/constants';
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

// Session plan generator with library-based progression
export function generateWeeklyPlan(plan, availability, paces, startDate) {
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
