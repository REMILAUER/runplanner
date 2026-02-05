/**
 * Session Detail Builder
 * Generates detailed workout structure for each session type
 */

import { formatPace, formatPaceRange, getPaceTarget } from './vdot';

/**
 * Get coach notes based on workout type and phase
 */
export function getCoachNotes(allure, phase) {
  const notes = {
    VMACourte: [
      "Séance intense — arrivez frais et bien échauffé",
      "Chaque répétition doit être courue à la même vitesse",
      "Si vous ralentissez de plus de 5s, arrêtez la série",
    ],
    VMALongue: [
      "Trouvez votre rythme dès le premier 200m",
      "La dernière répétition doit être aussi rapide que la première",
      "Récupérez activement en trottinant",
    ],
    Seuil2: [
      "Allure 'confortablement difficile'",
      "Vous devez pouvoir dire quelques mots, pas plus",
      "Restez régulier, pas de départ trop rapide",
    ],
    Tempo: [
      "Allure marathon ou semi-marathon",
      "Vous devez pouvoir parler par phrases courtes",
      "Concentrez-vous sur votre posture et votre respiration",
    ],
    Seuil1: [
      "Allure 'endurance haute'",
      "Conversation possible mais pas facile",
      "Restez relâché, pas de crispation",
    ],
    Easy: [
      "Respiration nasale possible = bon rythme",
      "Vous devez pouvoir tenir une conversation",
      "Si vous vous sentez fatigué, ralentissez",
    ],
  };

  const phaseNotes = {
    Base: "Phase de base : on construit les fondations.",
    Construction: "Phase de construction : on augmente l'intensité.",
    Spécifique: "Phase spécifique : chaque séance compte !",
    Affûtage: "Affûtage : la fraîcheur est prioritaire.",
  };

  const baseNotes = [...(notes[allure] || notes.Easy)];
  if (phaseNotes[phase]) baseNotes.push(phaseNotes[phase]);
  return baseNotes;
}

/**
 * Build interval blocks for VMA sessions
 */
export function buildIntervalBlocks(durationSec, allure, paces) {
  const repOptions = allure === "VMACourte"
    ? [
        { reps: 12, distance_m: 200, duration_sec: 45, recovery_sec: 45 },
        { reps: 10, distance_m: 300, duration_sec: 60, recovery_sec: 60 },
        { reps: 8, distance_m: 400, duration_sec: 80, recovery_sec: 90 },
      ]
    : [
        { reps: 6, distance_m: 800, duration_sec: 180, recovery_sec: 120 },
        { reps: 5, distance_m: 1000, duration_sec: 240, recovery_sec: 150 },
        { reps: 4, distance_m: 1200, duration_sec: 300, recovery_sec: 180 },
      ];

  let bestOption = repOptions[0];
  let bestDiff = Infinity;
  for (const opt of repOptions) {
    const total = opt.reps * opt.duration_sec + (opt.reps - 1) * opt.recovery_sec;
    const diff = Math.abs(total - durationSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestOption = opt;
    }
  }

  const paceTarget = getPaceTarget(paces, allure);
  return {
    description: `${bestOption.reps} × ${bestOption.distance_m}m`,
    pace: `@ ${paceTarget.str}/km`,
    duration: `${Math.round((bestOption.reps * bestOption.duration_sec) / 60)}min effort`,
    recovery: `Récup ${bestOption.recovery_sec}s trot`,
    qualityKm: (bestOption.reps * bestOption.distance_m) / 1000,
  };
}

/**
 * Build tempo/threshold blocks
 */
export function buildTempoBlocks(durationSec, paces, allure) {
  const paceTarget = getPaceTarget(paces, allure);
  
  if (durationSec >= 2400) {
    const blockDur = Math.floor(durationSec / 2) - 120;
    return {
      description: `2 × ${Math.floor(blockDur / 60)}min`,
      pace: `@ ${paceTarget.str}/km`,
      duration: `${Math.floor(durationSec / 60)}min total`,
      recovery: "3min récup trot",
      qualityKm: (2 * blockDur) / paceTarget.sec,
    };
  } else if (durationSec >= 1800) {
    const blockDur = Math.floor((durationSec - 240) / 3);
    return {
      description: `3 × ${Math.floor(blockDur / 60)}min`,
      pace: `@ ${paceTarget.str}/km`,
      duration: `${Math.floor(durationSec / 60)}min total`,
      recovery: "2min récup trot",
      qualityKm: (3 * blockDur) / paceTarget.sec,
    };
  }
  
  return {
    description: `${Math.floor(durationSec / 60)}min continu`,
    pace: `@ ${paceTarget.str}/km`,
    duration: `${Math.floor(durationSec / 60)}min`,
    recovery: null,
    qualityKm: durationSec / paceTarget.sec,
  };
}

/**
 * Generate weekly plan with dynamic sessions
 */
export function generateWeeklyPlan(plan, availability, paces, startDate) {
  if (!plan || !plan.cycles || plan.cycles.length === 0) return [];

  const cycle = plan.cycles[0];
  const { volumeSchedule, objective } = cycle;
  const sessionsPerWeek = availability?.sessionsPerWeek || 4;
  const trainingDays = availability?.trainingDays || ["Mar", "Jeu", "Sam", "Dim"];
  const distanceTarget = objective?.distance || "10km";

  const dayOffsets = { Lun: 0, Mar: 1, Mer: 2, Jeu: 3, Ven: 4, Sam: 5, Dim: 6 };
  const baseDate = startDate || new Date();

  const phaseObjectives = {
    Base: "Focus endurance — construire le socle aérobie",
    Construction: "Focus résistance — introduction de l'intensité",
    Spécifique: "Focus allure cible — préparation à l'objectif",
    Affûtage: "Focus fraîcheur — assimilation et récupération",
  };

  const easyPaceRange = formatPaceRange(paces, "Easy");
  const tempoPaceRange = formatPaceRange(paces, "Tempo");
  const seuilPaceRange = formatPaceRange(paces, "Seuil2");
  const vmaPaceRange = formatPaceRange(paces, "VMACourte");
  const vmaLPaceRange = formatPaceRange(paces, "VMALongue");

  return volumeSchedule.map((weekData, idx) => {
    const { week, phase, volume, isAssim } = weekData;

    const weekStartDate = new Date(baseDate);
    weekStartDate.setDate(weekStartDate.getDate() + idx * 7);

    let sessions = [];
    const kmPerSession = volume / sessionsPerWeek;

    // Generate sessions based on phase
    if (phase === "Base") {
      sessions = generateBasePhaseSessions(kmPerSession, sessionsPerWeek, easyPaceRange);
    } else if (phase === "Construction") {
      sessions = generateConstructionPhaseSessions(kmPerSession, sessionsPerWeek, paces, easyPaceRange, tempoPaceRange, vmaPaceRange);
    } else if (phase === "Spécifique") {
      sessions = generateSpecificPhaseSessions(kmPerSession, sessionsPerWeek, paces, easyPaceRange, tempoPaceRange);
    } else if (phase === "Affûtage") {
      sessions = generateTaperPhaseSessions(kmPerSession, easyPaceRange, tempoPaceRange, vmaPaceRange);
    }

    // Assign dates to sessions
    sessions = sessions.map((session, si) => {
      const dayName = trainingDays[si] || trainingDays[si % trainingDays.length];
      const dayOffset = dayOffsets[dayName] || 0;
      const sessionDate = new Date(weekStartDate);
      sessionDate.setDate(sessionDate.getDate() + dayOffset);
      return {
        ...session,
        dayName,
        date: sessionDate,
        dateFormatted: sessionDate.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
      };
    });

    // Adjust for assimilation weeks
    if (isAssim) {
      sessions = sessions.map((s) => ({
        ...s,
        distance: Math.round(s.distance * 0.75),
        notes: (s.notes || "") + " Semaine allégée : écoutez votre corps.",
      }));
    }

    return {
      week,
      phase,
      volume,
      isAssim,
      sessions,
      totalDistance: sessions.reduce((sum, s) => sum + s.distance, 0),
      weekStartDate,
      weekEndDate: new Date(weekStartDate.getTime() + 6 * 86400000),
      objective: phaseObjectives[phase] || "",
    };
  });
}

// Phase-specific session generators
function generateBasePhaseSessions(kmPerSession, sessionsPerWeek, easyPaceRange) {
  const sessions = [
    {
      type: "EF",
      title: "Footing endurance",
      duration: `${Math.round(kmPerSession * 5)}min`,
      distance: Math.round(kmPerSession * 0.9),
      warmup: { duration: "10min", pace: easyPaceRange, description: "Début très progressif" },
      main: [{ description: "Course continue en aisance respiratoire", duration: `${Math.round(kmPerSession * 4)}min`, pace: easyPaceRange }],
      cooldown: { duration: "5min", pace: easyPaceRange, description: "Retour au calme" },
      notes: "Vous devez pouvoir tenir une conversation.",
    },
    {
      type: "EF",
      title: "Footing + gammes",
      duration: `${Math.round(kmPerSession * 5)}min`,
      distance: Math.round(kmPerSession * 0.9),
      warmup: { duration: "15min", pace: easyPaceRange, description: "Footing progressif" },
      main: [
        { description: "Footing en endurance", duration: `${Math.round(kmPerSession * 3)}min`, pace: easyPaceRange },
        { description: "Gammes techniques + 4×100m accélérations", duration: "10min", pace: "Progressif" },
      ],
      cooldown: { duration: "5min", pace: easyPaceRange, description: "Trot léger" },
      notes: "Les accélérations activent les fibres rapides sans fatigue.",
    },
    {
      type: "SL",
      title: "Sortie longue",
      duration: `${Math.round(kmPerSession * 1.6 * 5.5)}min`,
      distance: Math.round(kmPerSession * 1.6),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [{ description: "Course continue, départ lent puis allure stable", duration: `${Math.round(kmPerSession * 1.6 * 5.5)}min`, pace: easyPaceRange }],
      cooldown: { duration: "5min", pace: "—", description: "Marche + étirements" },
      notes: "Emportez de l'eau si >1h. Restez en zone confortable.",
    },
  ];

  if (sessionsPerWeek >= 4) {
    sessions.push({
      type: "EF",
      title: "Footing récupération",
      duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`,
      distance: Math.round(kmPerSession * 0.6),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [{ description: "Footing très lent, récupération active", duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`, pace: easyPaceRange }],
      cooldown: { duration: "5min", pace: "—", description: "Étirements" },
      notes: "Séance optionnelle. Privilégiez le repos si fatigue.",
    });
  }

  return sessions;
}

function generateConstructionPhaseSessions(kmPerSession, sessionsPerWeek, paces, easyPaceRange, tempoPaceRange, vmaPaceRange) {
  const mainDur = Math.round(kmPerSession * 1.0 * 4);
  const seuilBlocks = buildTempoBlocks(mainDur * 60, paces, "Seuil2");

  const sessions = [
    {
      type: "SEUIL",
      title: "Seuil 2 intervalles",
      duration: `${Math.round(kmPerSession * 1.0 * 5)}min`,
      distance: Math.round(kmPerSession * 1.0),
      warmup: { duration: "15min", pace: easyPaceRange, description: "Footing + gammes + 3 accélérations" },
      main: [
        { description: seuilBlocks.description, duration: seuilBlocks.duration, pace: seuilBlocks.pace },
        seuilBlocks.recovery ? { description: seuilBlocks.recovery, duration: "—", pace: easyPaceRange } : null,
      ].filter(Boolean),
      cooldown: { duration: "10min", pace: easyPaceRange, description: "Retour au calme progressif" },
      notes: "Allure seuil = inconfortable mais tenable.",
    },
    {
      type: "EF",
      title: "Footing récupération",
      duration: `${Math.round(kmPerSession * 0.7 * 5.5)}min`,
      distance: Math.round(kmPerSession * 0.7),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [{ description: "Footing facile", duration: `${Math.round(kmPerSession * 0.7 * 5.5)}min`, pace: easyPaceRange }],
      cooldown: { duration: "5min", pace: "—", description: "Étirements" },
      notes: "Jour de récupération. Vraiment facile.",
    },
    {
      type: "SL",
      title: "Sortie longue progressive",
      duration: `${Math.round(kmPerSession * 1.7 * 5.5)}min`,
      distance: Math.round(kmPerSession * 1.7),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [
        { description: "Première partie en endurance", duration: `${Math.round(kmPerSession * 1.0 * 5.5)}min`, pace: easyPaceRange },
        { description: "Progression vers allure marathon", duration: `${Math.round(kmPerSession * 0.5 * 5.5)}min`, pace: tempoPaceRange },
      ],
      cooldown: { duration: "10min", pace: easyPaceRange, description: "Retour au calme" },
      notes: "Finir en accélérant apprend au corps à performer sur fatigue.",
    },
  ];

  if (sessionsPerWeek >= 4) {
    sessions.push({
      type: "EF",
      title: "Footing aérobie",
      duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`,
      distance: Math.round(kmPerSession * 0.6),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [{ description: "Footing facile", duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`, pace: easyPaceRange }],
      cooldown: { duration: "—", pace: "—", description: "Étirements" },
      notes: "Séance de volume facile.",
    });
  }

  if (sessionsPerWeek >= 5) {
    const vmaBlocks = buildIntervalBlocks(Math.round(kmPerSession * 0.7 * 60), "VMALongue", paces);
    sessions.splice(2, 0, {
      type: "VMA",
      title: "VMA longue",
      duration: `${Math.round(kmPerSession * 0.9 * 5)}min`,
      distance: Math.round(kmPerSession * 0.9),
      warmup: { duration: "20min", pace: easyPaceRange, description: "Footing + gammes + lignes droites" },
      main: [
        { description: vmaBlocks.description, duration: vmaBlocks.duration, pace: vmaBlocks.pace },
        { description: vmaBlocks.recovery, duration: "—", pace: easyPaceRange },
      ],
      cooldown: { duration: "10min", pace: easyPaceRange, description: "Retour au calme" },
      notes: "Régularité > vitesse. Chaque répétition au même temps.",
    });
  }

  return sessions;
}

function generateSpecificPhaseSessions(kmPerSession, sessionsPerWeek, paces, easyPaceRange, tempoPaceRange) {
  const tempoBlocks = buildTempoBlocks(Math.round(kmPerSession * 0.8 * 60), paces, "Tempo");

  const sessions = [
    {
      type: "TEMPO",
      title: "Tempo allure objectif",
      duration: `${Math.round(kmPerSession * 1.1 * 5)}min`,
      distance: Math.round(kmPerSession * 1.1),
      warmup: { duration: "15min", pace: easyPaceRange, description: "Footing + 4 accélérations" },
      main: [
        { description: tempoBlocks.description, duration: tempoBlocks.duration, pace: tempoBlocks.pace },
        tempoBlocks.recovery ? { description: tempoBlocks.recovery, duration: "—", pace: easyPaceRange } : null,
      ].filter(Boolean),
      cooldown: { duration: "10min", pace: easyPaceRange, description: "Retour au calme" },
      notes: "Allure cible de votre objectif. Mémorisez les sensations.",
    },
    {
      type: "EF",
      title: "Footing récupération",
      duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`,
      distance: Math.round(kmPerSession * 0.6),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [{ description: "Footing très facile", duration: `${Math.round(kmPerSession * 0.6 * 5.5)}min`, pace: easyPaceRange }],
      cooldown: { duration: "5min", pace: "—", description: "Étirements" },
      notes: "Récupération impérative après le tempo.",
    },
    {
      type: "SL",
      title: "Sortie longue spécifique",
      duration: `${Math.round(kmPerSession * 1.9 * 5.5)}min`,
      distance: Math.round(kmPerSession * 1.9),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [
        { description: "Première partie en endurance", duration: `${Math.round(kmPerSession * 0.8 * 5.5)}min`, pace: easyPaceRange },
        { description: "Bloc @ allure objectif", duration: `${Math.round(kmPerSession * 0.8 * 5.5)}min`, pace: tempoPaceRange },
        { description: "Retour en endurance", duration: `${Math.round(kmPerSession * 0.3 * 5.5)}min`, pace: easyPaceRange },
      ],
      cooldown: { duration: "10min", pace: easyPaceRange, description: "Marche + étirements" },
      notes: "Séance clé. Simule les conditions de course sur fatigue.",
    },
  ];

  if (sessionsPerWeek >= 4) {
    sessions.push({
      type: "EF",
      title: "Décrassage",
      duration: `${Math.round(kmPerSession * 0.4 * 5.5)}min`,
      distance: Math.round(kmPerSession * 0.4),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [{ description: "Footing très léger", duration: `${Math.round(kmPerSession * 0.4 * 5.5)}min`, pace: easyPaceRange }],
      cooldown: { duration: "—", pace: "—", description: "Étirements complets" },
      notes: "Optionnel. Repos complet si fatigue importante.",
    });
  }

  return sessions;
}

function generateTaperPhaseSessions(kmPerSession, easyPaceRange, tempoPaceRange, vmaPaceRange) {
  return [
    {
      type: "EF",
      title: "Footing + rappels",
      duration: `${Math.round(kmPerSession * 0.7 * 5.5)}min`,
      distance: Math.round(kmPerSession * 0.7),
      warmup: { duration: "10min", pace: easyPaceRange, description: "Footing tranquille" },
      main: [
        { description: "Footing facile", duration: `${Math.round(kmPerSession * 0.5 * 5.5)}min`, pace: easyPaceRange },
        { description: "5 × 100m @ allure 5km", duration: "5min", pace: vmaPaceRange },
      ],
      cooldown: { duration: "5min", pace: easyPaceRange, description: "Trot léger" },
      notes: "Garder les jambes vives sans accumuler de fatigue.",
    },
    {
      type: "TEMPO",
      title: "Rappel allure objectif",
      duration: `${Math.round(kmPerSession * 0.8 * 5)}min`,
      distance: Math.round(kmPerSession * 0.8),
      warmup: { duration: "15min", pace: easyPaceRange, description: "Footing + 3 accélérations" },
      main: [
        { description: "2 × 8min @ allure objectif", duration: "16min", pace: tempoPaceRange },
        { description: "Récupération : 3min trot", duration: "3min", pace: easyPaceRange },
      ],
      cooldown: { duration: "10min", pace: easyPaceRange, description: "Retour au calme" },
      notes: "Dernière séance de qualité. Sensations, pas chrono.",
    },
    {
      type: "EF",
      title: "Veille de course",
      duration: `${Math.round(kmPerSession * 0.5 * 5.5)}min`,
      distance: Math.round(kmPerSession * 0.5),
      warmup: { duration: "—", pace: "—", description: "—" },
      main: [
        { description: "Footing très léger", duration: "15min", pace: easyPaceRange },
        { description: "3 × 30s @ allure course (activation)", duration: "5min", pace: tempoPaceRange },
      ],
      cooldown: { duration: "5min", pace: "—", description: "Marche" },
      notes: "Juste une activation. Couchez-vous tôt, hydratez-vous bien.",
    },
  ];
}
