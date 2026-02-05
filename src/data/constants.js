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

// Font family
export const FONT = "'IBM Plex Mono', 'Courier New', monospace";

// Session types with metadata
export const SESSION_TYPES = {
  EF: { label: "Endurance Fondamentale", short: "EF", color: "#7ec8e3" },
  SL: { label: "Sortie Longue", short: "SL", color: "#4ca8a8" },
  SEUIL: { label: "Seuil", short: "Seuil", color: "#e8873c" },
  VMA: { label: "VMA", short: "VMA", color: "#d63031" },
  TEMPO: { label: "Tempo", short: "Tempo", color: "#e8c840" },
  RECUP: { label: "Récupération", short: "Récup", color: "#9e9e9e" },
  SV1: { label: "Seuil 1", short: "SV1", color: "#4a9e4a" },
  SV2: { label: "Seuil 2", short: "SV2", color: "#e8873c" },
};

// Phase colors
export const PHASE_COLORS = {
  Base: "#7ec8e3",
  Construction: "#e8873c",
  Spécifique: "#d63031",
  Affûtage: "#4a9e4a",
};

// Warmup templates by intensity
export const WARMUP_TEMPLATES = {
  easy: { duration_min: 0, description: "", blocks: [] },
  moderate: {
    duration_min: 10,
    description: "10min footing progressif",
    blocks: [
      { type: "warmup", duration_sec: 600, pace_zone: "Easy", description: "Footing souple, montée progressive" },
    ],
  },
  hard: {
    duration_min: 15,
    description: "15min footing + gammes",
    blocks: [
      { type: "warmup", duration_sec: 600, pace_zone: "Easy", description: "Footing souple" },
      { type: "warmup", duration_sec: 180, pace_zone: "Easy", description: "Gammes techniques (montées de genoux, talons-fesses)" },
      { type: "warmup", duration_sec: 120, pace_zone: "Actif", description: "2-3 accélérations progressives de 20s" },
    ],
  },
  intense: {
    duration_min: 20,
    description: "20min footing + gammes + lignes droites",
    blocks: [
      { type: "warmup", duration_sec: 720, pace_zone: "Easy", description: "Footing souple" },
      { type: "warmup", duration_sec: 180, pace_zone: "Easy", description: "Gammes techniques" },
      { type: "warmup", duration_sec: 180, pace_zone: "Actif", description: "3-4 lignes droites progressives de 80m" },
      { type: "warmup", duration_sec: 120, pace_zone: "Easy", description: "Récupération avant effort" },
    ],
  },
};

// Cooldown templates
export const COOLDOWN_TEMPLATES = {
  easy: { duration_min: 0, description: "", blocks: [] },
  moderate: {
    duration_min: 5,
    description: "5min retour au calme",
    blocks: [
      { type: "cooldown", duration_sec: 300, pace_zone: "Easy", description: "Footing très souple, relâchement" },
    ],
  },
  hard: {
    duration_min: 10,
    description: "10min retour au calme",
    blocks: [
      { type: "cooldown", duration_sec: 600, pace_zone: "Easy", description: "Footing souple, retour progressif au calme" },
    ],
  },
};
