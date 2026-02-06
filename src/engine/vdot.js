// ── VDOT + Pace Engine ──────────────────────────────────────────────
// Jack Daniels VDOT formula and pace zone computation.
// Extracted from App.jsx lines 32-80.

export function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

export function computeVDOT(distanceM, timeSec) {
  const tMin = timeSec / 60;
  const V = distanceM / tMin;
  const VO2 = -4.6 + 0.182258 * V + 0.000104 * V * V;
  const pct =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMin) +
    0.2989558 * Math.exp(-0.1932605 * tMin);
  return VO2 / pct;
}

export function paceFromFraction(vdot, fraction) {
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

export function computeAllPaces(vdot) {
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

export function formatPace(secPerKm) {
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
