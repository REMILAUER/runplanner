// ═══════════════════════════════════════════════════════════════════════
// Session Library — Bibliothèque de séances avec progression intra-cycle
// Organised: TYPE × PHASE × LEVEL
// ═══════════════════════════════════════════════════════════════════════

export const SESSION_LIBRARY = {

  // ═══════════════════════════════════════════════════════════════════
  // VMA COURTE (intervalles courts < 400m, intensité 95-100% VMA)
  // ═══════════════════════════════════════════════════════════════════

  VMA_COURTE: {
    Base: [
      {
        id: "vma_c_base_1",
        name: "Initiation VMA",
        level: 1,
        structure: {
          reps: 10,
          distance_m: 200,
          duration_sec: 45,
          recovery_type: "jog",
          recovery_sec: 45,
        },
        description: "10 × 200m",
        recovery_desc: "récup 200m trot (≈45s)",
        notes: "Première séance VMA du cycle. Objectif : trouver le bon rythme, pas forcer.",
        coach_tips: [
          "Partez à 95% de votre allure cible",
          "Les 3 dernières répétitions doivent être au même rythme que les premières",
          "Si vous ralentissez de plus de 3s, arrêtez la série",
        ],
      },
      {
        id: "vma_c_base_2",
        name: "Progression 300m",
        level: 2,
        structure: {
          reps: 8,
          distance_m: 300,
          duration_sec: 60,
          recovery_type: "jog",
          recovery_sec: 60,
        },
        description: "8 × 300m",
        recovery_desc: "récup 1min trot",
        notes: "On allonge légèrement l'effort.",
        coach_tips: [
          "Le 300m demande plus de gestion que le 200m",
          "Ne partez pas trop vite sur les 100 premiers mètres",
        ],
      },
    ],

    Construction: [
      {
        id: "vma_c_constr_1",
        name: "Classique 400m",
        level: 1,
        structure: {
          reps: 10,
          distance_m: 400,
          duration_sec: 80,
          recovery_type: "jog",
          recovery_sec: 90,
        },
        description: "10 × 400m",
        recovery_desc: "récup 1min15-1min30 trot",
        notes: "La séance VMA de référence. 400m = 1 tour de piste.",
        coach_tips: [
          "Visez la régularité : chaque 400m au même temps (±2s)",
          "Récupération active obligatoire, pas de marche",
        ],
      },
      {
        id: "vma_c_constr_2",
        name: "Pyramide VMA",
        level: 2,
        structure: {
          type: "pyramid",
          segments: [200, 300, 400, 400, 300, 200],
          recovery_type: "jog",
          recovery_ratio: 1.0,
        },
        description: "Pyramide 200-300-400-400-300-200m",
        recovery_desc: "récup égale au temps d'effort",
        notes: "Format ludique qui casse la monotonie. Le 400m du milieu est le plus dur.",
        coach_tips: [
          "Gérez votre effort : le premier 400 arrive vite",
          "La redescente doit être aussi rapide que la montée",
        ],
      },
      {
        id: "vma_c_constr_3",
        name: "Blocs VMA",
        level: 3,
        structure: {
          type: "sets",
          sets: 2,
          reps_per_set: 6,
          distance_m: 300,
          duration_sec: 55,
          recovery_intra_sec: 60,
          recovery_inter_sec: 180,
        },
        description: "2 × (6 × 300m)",
        recovery_desc: "récup 1min entre répétitions, 3min entre séries",
        notes: "Format en séries pour travailler la répétition d'efforts.",
        coach_tips: [
          "La 2ème série doit être aussi rapide que la première",
          "Profitez bien des 3min de récup pour vous regrouper mentalement",
        ],
      },
    ],

    Spécifique: [
      {
        id: "vma_c_spec_1",
        name: "VMA intensive",
        level: 1,
        structure: {
          reps: 12,
          distance_m: 300,
          duration_sec: 55,
          recovery_type: "jog",
          recovery_sec: 50,
        },
        description: "12 × 300m",
        recovery_desc: "récup 50s trot (récup courte)",
        notes: "Volume VMA augmenté, récup réduite. Séance exigeante.",
        coach_tips: [
          "Séance difficile : arrivez frais",
          "Si vous ne tenez pas le rythme après 8 répétitions, c'est normal — maintenez l'effort",
        ],
      },
      {
        id: "vma_c_spec_2",
        name: "30/30 classique",
        level: 2,
        structure: {
          type: "time_based",
          reps: 12,
          work_sec: 30,
          recovery_sec: 30,
          pace_zone: "VMACourte",
        },
        description: "12 × 30s/30s",
        recovery_desc: "30s trot entre chaque",
        notes: "Le fameux 30/30 de Véronique Billat. Format très efficace.",
        coach_tips: [
          "Trouvez un parcours plat ou légèrement montant",
          "Posez un repère pour savoir où vous devez arriver en 30s",
        ],
      },
    ],

    Affûtage: [
      {
        id: "vma_c_affu_1",
        name: "Rappel VMA",
        level: 1,
        structure: {
          reps: 6,
          distance_m: 200,
          duration_sec: 40,
          recovery_type: "jog",
          recovery_sec: 60,
        },
        description: "6 × 200m",
        recovery_desc: "récup 1min trot (récup longue)",
        notes: "Juste un rappel de vitesse. Volume réduit, récup généreuse.",
        coach_tips: [
          "Ne cherchez pas la performance, juste les sensations",
          "Vous devez finir frais, pas fatigué",
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // VMA LONGUE (intervalles moyens 600-1600m, intensité 90-95% VMA)
  // ═══════════════════════════════════════════════════════════════════

  VMA_LONGUE: {
    Base: [
      {
        id: "vma_l_base_1",
        name: "Initiation 800m",
        level: 1,
        structure: { reps: 5, distance_m: 800, duration_sec: 180, recovery_type: "jog", recovery_sec: 150 },
        description: "5 × 800m",
        recovery_desc: "récup 2min30 trot",
        notes: "Découverte de l'effort long à VMA. 800m = 2 tours de piste.",
        coach_tips: [
          "Partez prudemment, accélérez si vous êtes bien sur les dernières répétitions",
        ],
      },
      {
        id: "vma_l_base_2",
        name: "6 × 800m",
        level: 2,
        structure: { reps: 6, distance_m: 800, duration_sec: 180, recovery_type: "jog", recovery_sec: 130 },
        description: "6 × 800m",
        recovery_desc: "récup 2min trot",
        notes: "On augmente le volume et on réduit légèrement la récup.",
        coach_tips: [
          "Gardez le même temps sur les 6 répétitions",
          "La 5ème est souvent la plus dure mentalement",
        ],
      },
    ],

    Construction: [
      {
        id: "vma_l_constr_1",
        name: "Classique 1000m",
        level: 1,
        structure: { reps: 5, distance_m: 1000, duration_sec: 240, recovery_type: "jog", recovery_sec: 150 },
        description: "5 × 1000m",
        recovery_desc: "récup 2min30 trot",
        notes: "Le 1000m est la distance reine pour le 10km.",
        coach_tips: [
          "Chaque 1000m doit être couru au même rythme (±3s)",
          "Récupération active : trottez, ne marchez pas",
        ],
      },
      {
        id: "vma_l_constr_2",
        name: "Progression 1200m",
        level: 2,
        structure: { reps: 4, distance_m: 1200, duration_sec: 300, recovery_type: "jog", recovery_sec: 180 },
        description: "4 × 1200m",
        recovery_desc: "récup 3min trot",
        notes: "On allonge encore. Le 1200m demande une vraie gestion.",
        coach_tips: [
          "Le 1200m c'est 3 tours de piste : gérez chaque tour",
          "Ne partez pas comme sur un 400m",
        ],
      },
      {
        id: "vma_l_constr_3",
        name: "Mixte 1000/600",
        level: 3,
        structure: {
          type: "mixed",
          segments: [
            { distance_m: 1000, recovery_sec: 150 },
            { distance_m: 600, recovery_sec: 90 },
            { distance_m: 1000, recovery_sec: 150 },
            { distance_m: 600, recovery_sec: 90 },
            { distance_m: 1000, recovery_sec: 0 },
          ],
        },
        description: "1000-600-1000-600-1000m",
        recovery_desc: "récup 2min30 après 1000m, 1min30 après 600m",
        notes: "Alternance qui casse le rythme mental.",
        coach_tips: [
          "Les 600m doivent être courus légèrement plus vite que les 1000m",
          "Concentration maximale sur le dernier 1000m",
        ],
      },
    ],

    Spécifique: [
      {
        id: "vma_l_spec_1",
        name: "6 × 1000m",
        level: 1,
        structure: { reps: 6, distance_m: 1000, duration_sec: 230, recovery_type: "jog", recovery_sec: 130 },
        description: "6 × 1000m",
        recovery_desc: "récup 2min trot",
        notes: "Volume important à allure 5-10km.",
        coach_tips: [
          "C'est la séance clé de la phase spécifique",
          "Régularité absolue : chaque 1000m au même temps",
        ],
      },
      {
        id: "vma_l_spec_2",
        name: "3 × 1600m",
        level: 2,
        structure: { reps: 3, distance_m: 1600, duration_sec: 400, recovery_type: "jog", recovery_sec: 180 },
        description: "3 × 1600m (4 tours)",
        recovery_desc: "récup 3min trot",
        notes: "Effort très spécifique 5-10km. Concentration maximale.",
        coach_tips: [
          "Le 1600m se court comme un 1000m + 600m supplémentaire",
          "Restez concentré sur la régularité au tour",
        ],
      },
    ],

    Affûtage: [
      {
        id: "vma_l_affu_1",
        name: "Rappel 3 × 800m",
        level: 1,
        structure: { reps: 3, distance_m: 800, duration_sec: 180, recovery_type: "jog", recovery_sec: 180 },
        description: "3 × 800m",
        recovery_desc: "récup 3min trot (généreuse)",
        notes: "Maintien des sensations, pas de fatigue.",
        coach_tips: [
          "Juste retrouver les sensations de vitesse",
          "3 répétitions suffisent, pas besoin de forcer",
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SEUIL 2 (allure 10-15km, intensité 85-90% VMA)
  // ═══════════════════════════════════════════════════════════════════

  SEUIL2: {
    Base: [
      {
        id: "seuil2_base_1",
        name: "Découverte seuil",
        level: 1,
        structure: { reps: 3, duration_sec: 480, recovery_type: "jog", recovery_sec: 150 },
        description: "3 × 8min",
        recovery_desc: "récup 2min30 trot",
        notes: "Première séance seuil. Trouvez le bon rythme : inconfortable mais tenable.",
        coach_tips: [
          "L'allure seuil se situe entre le confort et l'essoufflement",
          "Vous devez pouvoir dire des phrases courtes, pas chanter",
        ],
      },
      {
        id: "seuil2_base_2",
        name: "4 × 6min",
        level: 2,
        structure: { reps: 4, duration_sec: 360, recovery_type: "jog", recovery_sec: 120 },
        description: "4 × 6min",
        recovery_desc: "récup 2min trot",
        notes: "Format classique pour installer le seuil.",
        coach_tips: [
          "4 blocs de 6min = plus facile mentalement que 3 × 8min",
          "La régularité prime sur la vitesse",
        ],
      },
    ],

    Construction: [
      {
        id: "seuil2_constr_1",
        name: "3 × 10min",
        level: 1,
        structure: { reps: 3, duration_sec: 600, recovery_type: "jog", recovery_sec: 150 },
        description: "3 × 10min",
        recovery_desc: "récup 2min30 trot",
        notes: "On allonge les blocs. 10min au seuil = effort significatif.",
        coach_tips: [
          "10min c'est long au seuil — trouvez un rythme tenable dès le départ",
          "Respirez en 3 temps si ça aide",
        ],
      },
      {
        id: "seuil2_constr_2",
        name: "Pyramide seuil",
        level: 2,
        structure: {
          type: "pyramid",
          segments_sec: [360, 480, 600, 480, 360],
          recovery_sec: 120,
        },
        description: "Pyramide 6-8-10-8-6min",
        recovery_desc: "récup 2min entre chaque",
        notes: "Le bloc de 10min au milieu est le cœur de la séance.",
        coach_tips: [
          "Le 10min central est le moment clé, ne le ratez pas",
          "La redescente doit être au même rythme que la montée",
        ],
      },
      {
        id: "seuil2_constr_3",
        name: "2 × 15min",
        level: 3,
        structure: { reps: 2, duration_sec: 900, recovery_type: "jog", recovery_sec: 180 },
        description: "2 × 15min",
        recovery_desc: "récup 3min trot",
        notes: "Blocs longs. Concentration et régularité.",
        coach_tips: [
          "15min au seuil = gros effort mental, découpez en blocs de 5min dans votre tête",
          "Profitez des 3min de récup pour bien récupérer",
        ],
      },
    ],

    Spécifique: [
      {
        id: "seuil2_spec_1",
        name: "4 × 8min récup courte",
        level: 1,
        structure: { reps: 4, duration_sec: 480, recovery_type: "jog", recovery_sec: 90 },
        description: "4 × 8min",
        recovery_desc: "récup 1min30 trot (courte)",
        notes: "Même volume qu'avant mais récup réduite = plus dur.",
        coach_tips: [
          "La récup courte simule les conditions de course",
          "Ne partez pas trop vite sur le premier bloc",
        ],
      },
      {
        id: "seuil2_spec_2",
        name: "20min continu",
        level: 2,
        structure: { reps: 1, duration_sec: 1200, recovery_type: null, recovery_sec: 0 },
        description: "20min continu au seuil",
        recovery_desc: "—",
        notes: "Le test ultime : 20min non-stop à allure seuil.",
        coach_tips: [
          "C'est LA séance de référence — si vous la réussissez, vous êtes prêt",
          "Commencez 2-3s plus lent que votre allure cible, accélérez après 5min",
        ],
      },
    ],

    Affûtage: [
      {
        id: "seuil2_affu_1",
        name: "2 × 6min",
        level: 1,
        structure: { reps: 2, duration_sec: 360, recovery_type: "jog", recovery_sec: 180 },
        description: "2 × 6min",
        recovery_desc: "récup 3min trot",
        notes: "Juste un rappel, on garde les sensations sans se fatiguer.",
        coach_tips: [
          "Ne cherchez pas la performance, juste les sensations",
          "Vous devez finir frais",
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // TEMPO (allure semi/marathon, intensité 75-85% VMA)
  // ═══════════════════════════════════════════════════════════════════

  TEMPO: {
    Base: [
      {
        id: "tempo_base_1",
        name: "Découverte tempo",
        level: 1,
        structure: { reps: 2, duration_sec: 600, recovery_type: "jog", recovery_sec: 180 },
        description: "2 × 10min",
        recovery_desc: "récup 3min trot",
        notes: "Allure marathon/semi. Vous devez pouvoir parler par phrases courtes.",
        coach_tips: [
          "L'allure tempo est plus lente que le seuil — ne confondez pas",
          "Concentrez-vous sur la fluidité de la foulée",
        ],
      },
      {
        id: "tempo_base_2",
        name: "3 × 10min",
        level: 2,
        structure: { reps: 3, duration_sec: 600, recovery_type: "jog", recovery_sec: 150 },
        description: "3 × 10min",
        recovery_desc: "récup 2min30 trot",
        notes: "On augmente le volume tempo.",
        coach_tips: [
          "30min de tempo = une bonne base d'endurance spécifique",
          "Gardez le même rythme sur les 3 blocs",
        ],
      },
    ],

    Construction: [
      {
        id: "tempo_constr_1",
        name: "2 × 15min",
        level: 1,
        structure: { reps: 2, duration_sec: 900, recovery_type: "jog", recovery_sec: 180 },
        description: "2 × 15min",
        recovery_desc: "récup 3min trot",
        notes: "Blocs plus longs pour habituer le corps à l'effort prolongé.",
        coach_tips: [
          "15min de tempo c'est le moment de travailler le mental",
          "Trouvez votre rythme de croisière",
        ],
      },
      {
        id: "tempo_constr_2",
        name: "2 × 20min",
        level: 2,
        structure: { reps: 2, duration_sec: 1200, recovery_type: "jog", recovery_sec: 240 },
        description: "2 × 20min",
        recovery_desc: "récup 4min trot",
        notes: "Séance exigeante. 40min de tempo au total.",
        coach_tips: [
          "40min de tempo fractionné = excellente préparation semi/marathon",
          "La récup de 4min doit vous permettre de repartir à la même allure",
        ],
      },
      {
        id: "tempo_constr_3",
        name: "30min continu",
        level: 3,
        structure: { reps: 1, duration_sec: 1800, recovery_type: null, recovery_sec: 0 },
        description: "30min continu au tempo",
        recovery_desc: "—",
        notes: "Simulation d'effort prolongé. Concentration mentale.",
        coach_tips: [
          "30min non-stop à allure tempo : mentalement exigeant",
          "Découpez en 3 blocs de 10min dans votre tête pour tenir",
        ],
      },
    ],

    Spécifique: [
      {
        id: "tempo_spec_1",
        name: "3 × 15min",
        level: 1,
        structure: { reps: 3, duration_sec: 900, recovery_type: "jog", recovery_sec: 150 },
        description: "3 × 15min",
        recovery_desc: "récup 2min30 trot",
        notes: "45min de tempo fractionné. Gros volume.",
        coach_tips: [
          "C'est la séance la plus longue en tempo — arrivez frais",
          "Si le 3ème bloc est trop dur, courez-le 5s/km plus lent",
        ],
      },
      {
        id: "tempo_spec_2",
        name: "40min continu",
        level: 2,
        structure: { reps: 1, duration_sec: 2400, recovery_type: null, recovery_sec: 0 },
        description: "40min continu au tempo",
        recovery_desc: "—",
        notes: "Pour les préparations marathon/semi. Effort mental important.",
        coach_tips: [
          "Séance de simulation course — mettez-vous en condition mentale de compétition",
          "Hydratez-vous avant et pendant si possible",
        ],
      },
    ],

    Affûtage: [
      {
        id: "tempo_affu_1",
        name: "Rappel 2 × 8min",
        level: 1,
        structure: { reps: 2, duration_sec: 480, recovery_type: "jog", recovery_sec: 180 },
        description: "2 × 8min",
        recovery_desc: "récup 3min trot",
        notes: "Rappel des sensations allure objectif. Ne forcez pas.",
        coach_tips: [
          "Dernière séance de qualité avant la course",
          "L'objectif est de retrouver les sensations, pas de performer",
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SORTIE LONGUE
  // ═══════════════════════════════════════════════════════════════════

  SORTIE_LONGUE: {
    Base: [
      {
        id: "sl_base_1",
        name: "SL endurance pure",
        level: 1,
        type: "steady",
        description: "Sortie longue 100% endurance",
        pace_zones: ["Easy"],
        distribution: [1.0],
        notes: "Restez en aisance respiratoire tout du long. Pas de montre, juste les sensations.",
        coach_tips: [
          "Emportez de l'eau si la sortie dépasse 1h",
          "Commencez très lentement — les 10 premières minutes servent d'échauffement",
        ],
      },
      {
        id: "sl_base_2",
        name: "SL finish rapide",
        level: 2,
        type: "progressive",
        description: "SL avec accélération finale",
        pace_zones: ["Easy", "Actif"],
        distribution: [0.85, 0.15],
        notes: "Finissez les 15 dernières minutes un peu plus vite (pas tempo, juste actif).",
        coach_tips: [
          "L'accélération finale doit être naturelle, pas forcée",
          "C'est un finish rapide, pas un sprint — restez en zone active",
        ],
      },
    ],

    Construction: [
      {
        id: "sl_constr_1",
        name: "SL progressive",
        level: 1,
        type: "progressive",
        description: "SL en negative split",
        pace_zones: ["Easy", "Actif"],
        distribution: [0.7, 0.3],
        notes: "Partez tranquille, accélérez progressivement sur le dernier tiers.",
        coach_tips: [
          "Le negative split = finir plus vite que vous n'avez commencé",
          "Patience dans la première moitié, accélérez dans la seconde",
        ],
      },
      {
        id: "sl_constr_2",
        name: "SL avec bloc tempo",
        level: 2,
        type: "sandwich",
        description: "SL avec bloc tempo au milieu",
        structure: ["easy_30%", "tempo_25%", "easy_45%"],
        pace_zones: ["Easy", "Tempo", "Easy"],
        notes: "Bloc tempo quand vous êtes déjà fatigué. Excellent travail spécifique.",
        coach_tips: [
          "Le bloc tempo au milieu simule une accélération en course",
          "Reprenez un rythme calme après le bloc tempo, ne forcez pas la fin",
        ],
      },
      {
        id: "sl_constr_3",
        name: "SL fartlek",
        level: 3,
        type: "fartlek",
        description: "SL avec variations libres",
        structure: "easy + 6×3min actif avec 3min easy entre",
        pace_zones: ["Easy", "Actif"],
        notes: "Insérez des accélérations au feeling. Écoutez votre corps.",
        coach_tips: [
          "Le fartlek = jeu de vitesse — pas de chrono, au ressenti",
          "Si une côte se présente, accélérez dessus",
        ],
      },
    ],

    Spécifique: [
      {
        id: "sl_spec_1",
        name: "SL spécifique semi",
        level: 1,
        type: "specific",
        description: "SL avec gros bloc allure objectif",
        structure: ["easy_40%", "tempo_40%", "easy_20%"],
        pace_zones: ["Easy", "Tempo", "Easy"],
        notes: "Simulation de course : partez cool, envoyez l'allure cible, gérez la fin.",
        coach_tips: [
          "C'est une simulation — mettez-vous dans les conditions de course",
          "Le retour en endurance est important pour la récupération",
        ],
      },
      {
        id: "sl_spec_2",
        name: "SL marathon pace",
        level: 2,
        type: "specific",
        description: "SL avec longue portion allure marathon",
        structure: ["easy_30%", "tempo_50%", "easy_20%"],
        pace_zones: ["Easy", "Tempo", "Easy"],
        notes: "Pour les marathoniens : 50% de la SL à allure cible.",
        coach_tips: [
          "50% de la SL à allure marathon = séance exigeante",
          "Si l'allure chute en fin de bloc, ne forcez pas — repassez en endurance",
        ],
      },
    ],

    Affûtage: [
      {
        id: "sl_affu_1",
        name: "SL courte",
        level: 1,
        type: "steady",
        description: "SL réduite, 100% easy",
        pace_zones: ["Easy"],
        duration_factor: 0.6,
        notes: "Volume réduit. Juste entretenir l'endurance sans fatiguer.",
        coach_tips: [
          "Pas plus de 60% de votre SL habituelle",
          "Si vous vous sentez bien, c'est bon signe — mais ne rallongez pas",
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // FOOTING (récupération et endurance fondamentale)
  // ═══════════════════════════════════════════════════════════════════

  FOOTING: {
    all_phases: [
      {
        id: "footing_easy",
        name: "Footing endurance",
        level: 1,
        description: "Footing en aisance respiratoire",
        pace_zones: ["Easy"],
        notes: "La base de tout. Vous devez pouvoir tenir une conversation.",
        coach_tips: [
          "Si vous êtes essoufflé, ralentissez — pas de honte à courir lentement",
        ],
      },
      {
        id: "footing_recup",
        name: "Footing récupération",
        level: 1,
        description: "Footing très lent post-séance dure",
        pace_zones: ["Easy"],
        duration_factor: 0.7,
        notes: "Récupération active. Encore plus lent que d'habitude.",
        coach_tips: [
          "Courez comme si vous vous promeniez avec un ami qui ne court pas",
        ],
      },
      {
        id: "footing_gammes",
        name: "Footing + gammes",
        level: 2,
        description: "Footing avec éducatifs",
        pace_zones: ["Easy"],
        includes: ["gammes", "accélérations"],
        gammes_detail: "10min : montées de genoux, talons-fesses, pas chassés, griffés",
        accelerations: "4-6 × 80m progressifs",
        notes: "Travail technique + activation neuromusculaire.",
        coach_tips: [
          "Les gammes améliorent votre foulée sans vous fatiguer",
          "Les accélérations finales préparent les muscles aux séances dures",
        ],
      },
      {
        id: "footing_rappel",
        name: "Footing + rappels VMA",
        level: 3,
        description: "Footing avec rappels de vitesse",
        pace_zones: ["Easy", "VMACourte"],
        structure: "footing + 6-8 × 20-30s vite avec 1min30 récup",
        notes: "Maintient les qualités de vitesse sans séance complète.",
        coach_tips: [
          "Les rappels sont courts et intenses — 100% pendant 20-30s",
          "Récupérez complètement entre chaque rappel",
        ],
      },
      {
        id: "footing_long",
        name: "Footing long",
        level: 2,
        description: "Footing plus long que d'habitude",
        pace_zones: ["Easy"],
        duration_factor: 1.3,
        notes: "Ajoute du volume en restant facile.",
        coach_tips: [
          "Le volume est roi en endurance — courir plus longtemps > courir plus vite",
        ],
      },
    ],
  },
};
