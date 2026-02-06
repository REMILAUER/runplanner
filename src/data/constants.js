// ── Data constants ─────────────────────────────────────────────────
// Single source of truth for all app constants.
// Merged from App.jsx lines 8-30, 84-93, 586-618, 777-781, 1691-1701.

// Default reference times for each distance
export const DEFAULT_TIMES = {
  "1500": "4:30",
  "3000": "10:00",
  "5km": "20:00",
  "10km": "40:00",
  "Semi Marathon": "1:30:00",
  "Marathon": "3:00:00",
};

// Distance in meters
export const DISTANCE_METERS = {
  "1500": 1500,
  "3000": 3000,
  "5km": 5000,
  "10km": 10000,
  "Semi Marathon": 21097,
  "Marathon": 42195,
};

// Available objective distances
export const OBJECTIVE_DISTANCES = ["5km", "10km", "Semi Marathon", "Marathon"];

// All distances including shorter ones for reference
export const ALL_DISTANCES = ["1500", "3000", ...OBJECTIVE_DISTANCES];

// Days of the week
export const DAYS_LIST = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Objective priority types
export const OBJ_TYPES = ["Prioritaire", "Secondaire", "Annexe"];

// ── Periodization constants ───────────────────────────────────────

export const RECOVERY_DAYS = { "5km": 7, "10km": 7, "Semi Marathon": 10, "Marathon": 14 };
export const SPECIFIC_MAX_WEEKS = { "5km": 4, "10km": 4, "Semi Marathon": 4, "Marathon": 6 };
export const CONSTRUCTION_PREREQ = { "5km": 6, "10km": 6, "Semi Marathon": 6, "Marathon": 4 };
export const MIN_WEEKS_BEFORE_PRIO = 8;
export const MIN_WEEKS_BETWEEN_PRIO = 8;
export const ABSOLUTE_CAP = 210;
export const CEILING_GROWTH_RATE = 0.03; // +3%/week once global ceiling is reached
export const DISTANCE_MIN_CEILING = { "5km": 40, "10km": 40, "Semi Marathon": 45, "Marathon": 55 };

// ── V2 Volume constants ─────────────────────────────────────────────

// Max SL distance per target race
export const SL_MAX_KM = { "5km": 22, "10km": 22, "Semi Marathon": 30, "Marathon": 36 };

// Tiered cap factors: how much above reference volume we allow
export const VOLUME_CAP_FACTORS = [
  { threshold: 30,       factor: 1.00 },
  { threshold: 50,       factor: 0.75 },
  { threshold: 70,       factor: 0.50 },
  { threshold: 100,      factor: 0.30 },
  { threshold: 150,      factor: 0.20 },
  { threshold: Infinity, factor: 0.20 },
];

// Taper week-by-week volume multipliers per distance
// Designed to avoid detraining: max drop ~35-40% from peak
export const TAPER_PROFILES = {
  "5km":           [0.80],
  "10km":          [0.80],
  "Semi Marathon": [0.80, 0.65],
  "Marathon_low":  [0.80, 0.65],
  "Marathon_high": [0.80, 0.70, 0.60],
};

// Minimum recommended peak volume per race distance (for warnings)
export const DISTANCE_MIN_VOLUME = { "5km": 25, "10km": 35, "Semi Marathon": 40, "Marathon": 50 };

// Volume distribution percentages per session role
export const VOLUME_DISTRIBUTION = {
  SL_PCT:           0.30,
  QUALITY_HIGH_PCT: 0.20,
  QUALITY_LOW_PCT:  0.15,
  RECUP_PCT:        0.10,
};

// ── Phase display ─────────────────────────────────────────────────

export const PHASE_COLORS = {
  "Base": "#7ec8e3",
  "Construction": "#e8873c",
  "Spécifique": "#d63031",
  "Affûtage": "#4a9e4a",
};

export const PHASE_DESCRIPTIONS = {
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
    desc: "Séances aux allures de course. Volume en plateau au cap atteint en Construction. Intensité maximale ciblée sur la distance objectif. Dernière ligne droite avant l'affûtage.",
    icon: "▩",
  },
  "Affûtage": {
    title: "Affûtage",
    subtitle: "Arriver frais le jour J",
    desc: "Réduction du volume (−25 à −30%) tout en maintenant quelques rappels d'intensité. Le corps assimile les semaines précédentes. Vous arrivez au départ en pleine forme.",
    icon: "◫",
  },
};

// ── Pace zone display ─────────────────────────────────────────────

export const PACE_ORDER = ["Easy", "Actif", "Seuil1", "Tempo", "Seuil2", "VMALongue", "VMACourte"];

export const ZONE_COLORS = {
  Easy: "#7ec8e3", Actif: "#4ca8a8", Seuil1: "#4a9e4a", Tempo: "#e8c840",
  Seuil2: "#e8873c", VMALongue: "#d63031", VMACourte: "#8b1a1a",
};

// ── Session types ─────────────────────────────────────────────────

export const SESSION_TYPES = {
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
