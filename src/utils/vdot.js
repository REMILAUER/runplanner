import { DISTANCE_METERS } from '../data/constants';

/**
 * Parse time string to seconds
 * @param {string} timeStr - Time in format "MM:SS" or "HH:MM:SS"
 * @returns {number} - Total seconds
 */
export function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/**
 * Format seconds to pace string
 * @param {number} totalSeconds - Pace in seconds per km
 * @returns {string} - Formatted pace "M:SS"
 */
export function formatPace(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format seconds to duration string
 * @param {number} totalSeconds - Duration in seconds
 * @returns {string} - Formatted duration "Xh XXmin" or "XXmin"
 */
export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins.toString().padStart(2, "0")}min`;
  return `${mins}min`;
}

/**
 * Estimate VDOT from a race performance
 * Uses Daniels' Running Formula approximation
 * @param {string} distance - Distance key (e.g., "10km")
 * @param {string} timeStr - Time string
 * @returns {number} - Estimated VDOT
 */
export function estimateVDOT(distance, timeStr) {
  const timeSeconds = parseTimeToSeconds(timeStr);
  const distanceM = DISTANCE_METERS[distance] || 10000;
  
  const timeMinutes = timeSeconds / 60;
  const velocity = distanceM / timeMinutes; // meters per minute
  
  // Daniels formula approximation
  const percentVO2 = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMinutes) + 
                     0.2989558 * Math.exp(-0.1932605 * timeMinutes);
  const vo2 = -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
  const vdot = vo2 / percentVO2;
  
  return Math.round(vdot * 10) / 10;
}

/**
 * Calculate pace from VDOT for a given intensity fraction
 * @param {number} vdot - VDOT value
 * @param {number} fraction - Intensity fraction (0.0 - 1.0)
 * @returns {number} - Pace in seconds per km
 */
export function paceFromVDOT(vdot, fraction) {
  const vo2 = vdot * fraction;
  // Inverse of Daniels formula
  const velocity = 29.54 + 5.000663 * vo2 - 0.007546 * vo2 * vo2;
  const paceSecPerKm = 1000 / velocity * 60;
  return Math.round(paceSecPerKm);
}

/**
 * Compute all training paces from VDOT
 * @param {number} vdot - VDOT value
 * @returns {Object} - Object with pace zones
 */
export function computeAllPaces(vdot) {
  const zones = {
    Easy: { fractionSlow: 0.59, fractionFast: 0.74 },
    Actif: { fractionSlow: 0.74, fractionFast: 0.84 },
    Seuil1: { fractionSlow: 0.84, fractionFast: 0.88 },
    Tempo: { fractionSlow: 0.88, fractionFast: 0.92 },
    Seuil2: { fractionSlow: 0.92, fractionFast: 0.97 },
    VMALongue: { fractionSlow: 0.97, fractionFast: 1.0 },
    VMACourte: { fractionSlow: 1.0, fractionFast: 1.05 },
  };

  const paces = {};
  for (const [zone, { fractionSlow, fractionFast }] of Object.entries(zones)) {
    const slow = paceFromVDOT(vdot, fractionSlow);
    const fast = paceFromVDOT(vdot, fractionFast);
    paces[zone] = { slow, fast };
  }
  return paces;
}

/**
 * Format pace range for display
 * @param {Object} paces - Paces object from computeAllPaces
 * @param {string} zone - Zone name
 * @returns {string} - Formatted range "X:XX-X:XX"
 */
export function formatPaceRange(paces, zone) {
  if (!paces || !paces[zone]) return "—";
  return `${formatPace(paces[zone].fast)}-${formatPace(paces[zone].slow)}`;
}

/**
 * Get target pace for a zone (middle of range)
 * @param {Object} paces - Paces object
 * @param {string} zone - Zone name
 * @returns {Object} - { sec, str }
 */
export function getPaceTarget(paces, zone) {
  if (!paces || !paces[zone]) return { sec: 300, str: "5:00" };
  const mid = Math.round((paces[zone].slow + paces[zone].fast) / 2);
  return { sec: mid, str: formatPace(mid) };
}
