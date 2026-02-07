import { useState } from 'react';
import { FONT } from '../../styles/tokens';
import { s } from '../../styles/styles';
import { SESSION_TYPES, ZONE_COLORS } from '../../data/constants';
import { fmtDist } from '../../engine/weekGenerator';

// ── Zone intensity heights for skyline (0-1 scale) ──
const ZONE_HEIGHTS = {
  Easy: 0.25, Actif: 0.20, Seuil1: 0.50, Tempo: 0.60,
  Seuil2: 0.75, VMALongue: 0.88, VMACourte: 1.0,
};

// ── RPE color mapping ──
function rpeColor(rpe) {
  if (rpe <= 3) return "#7ec8e3";
  if (rpe <= 5) return "#4a9e4a";
  if (rpe <= 6) return "#e8c840";
  if (rpe <= 7) return "#e8873c";
  return "#d63031";
}

// ── Zone color with fallback ──
function zoneColor(zone) {
  return ZONE_COLORS[zone] || "#b0b0b0";
}

// ── Build skyline segments from _dbSteps ──
function buildSkylineSegments(session) {
  const steps = session._dbSteps;
  if (!steps || steps.length === 0) return [];

  const segments = [];

  for (const step of steps) {
    const zone = step.paceZone || "Easy";
    const height = ZONE_HEIGHTS[zone] || 0.25;
    const color = step.stepType === "warmup" || step.stepType === "cooldown"
      ? "#b0b0b0"
      : zoneColor(zone);

    // For interval steps with reps, expand into work+recovery blocks
    if (step.reps && step.reps > 1 && step.stepType === "main") {
      const workDur = step.durationSec || 60;
      const recDur = step.recoveryDurationSec || workDur;
      const sets = step.sets || 1;
      const repsPerSet = step.sets ? (step.reps || 1) : step.reps;
      const interSetDur = step.recoveryBetweenSetsSec || 180;

      for (let si = 0; si < sets; si++) {
        for (let ri = 0; ri < repsPerSet; ri++) {
          segments.push({ dur: workDur, height, color, type: "work" });
          if (ri < repsPerSet - 1) {
            segments.push({ dur: recDur, height: 0.15, color: "#d0d0d0", type: "recovery" });
          }
        }
        if (si < sets - 1) {
          segments.push({ dur: interSetDur, height: 0.12, color: "#d0d0d0", type: "recovery" });
        }
      }
    } else {
      // Single block (warmup, cooldown, continuous effort, or single rep)
      const dur = step.durationSec || 300; // fallback 5min
      segments.push({ dur, height, color, type: step.stepType });
    }
  }

  return segments;
}

// ── Intensity Skyline Component ──
function IntensitySkyline({ session }) {
  const segments = buildSkylineSegments(session);
  if (segments.length === 0) return null;

  const totalDur = segments.reduce((sum, seg) => sum + seg.dur, 0);
  if (totalDur === 0) return null;

  const SKYLINE_H = 64;

  return (
    <div style={{
      display: "flex", alignItems: "flex-end", height: SKYLINE_H,
      padding: "8px 16px 0", background: "#f4f4f4",
      borderBottom: "1px solid #e0e0e0", gap: 1,
      overflow: "hidden",
    }}>
      {segments.map((seg, i) => {
        const widthPct = Math.max(0.3, (seg.dur / totalDur) * 100);
        return (
          <div
            key={i}
            style={{
              flex: `0 0 ${widthPct}%`,
              height: `${Math.round(seg.height * SKYLINE_H)}px`,
              background: seg.color,
              borderRadius: "2px 2px 0 0",
              minWidth: 2,
              transition: "height 0.2s ease",
            }}
          />
        );
      })}
    </div>
  );
}

// ── RPE Gauge Component ──
function RpeGauge({ rpe }) {
  if (!rpe && rpe !== 0) return null;
  const dots = 10;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginRight: 2 }}>RPE</span>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: dots }, (_, i) => (
          <div
            key={i}
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: i < rpe ? rpeColor(rpe) : "rgba(255,255,255,0.25)",
              border: i < rpe ? "none" : "1px solid rgba(255,255,255,0.3)",
              boxSizing: "border-box",
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", marginLeft: 2 }}>
        {rpe}/10
      </span>
    </div>
  );
}

// ── Zone Badge (small colored pill) ──
function ZoneBadge({ zone }) {
  if (!zone || zone === "Easy") return null;
  const label = zone === "VMACourte" ? "VMA" : zone === "VMALongue" ? "VMA longue" : zone;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: "#fff",
      background: zoneColor(zone), borderRadius: 3,
      padding: "1px 5px", marginLeft: 6, verticalAlign: "middle",
      letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}

// ── Main block renderer — handles repeat bracket notation ──
function MainBlockContent({ session, sessionType }) {
  const steps = session._dbSteps?.filter(st => st.stepType === "main") || [];

  // If we have structured _dbSteps with reps, use compact repeat notation
  if (steps.length === 1 && steps[0].reps && steps[0].reps > 1) {
    const step = steps[0];
    const zone = step.paceZone || "Easy";
    const borderColor = zoneColor(zone);

    // Format work duration
    const workStr = step.durationSec
      ? (step.durationSec >= 60 ? `${Math.round(step.durationSec / 60)}min` : `${step.durationSec}s`)
      : (step.distanceM ? `${step.distanceM}m` : "—");

    // Format recovery
    const recStr = step.recoveryDurationSec
      ? (step.recoveryDurationSec >= 60 ? `${Math.round(step.recoveryDurationSec / 60)}min` : `${step.recoveryDurationSec}s`)
      : "—";

    // Sets notation
    const setsPrefix = step.sets && step.sets > 1 ? `${step.sets} × ` : "";
    const repsCount = step.sets ? step.reps : step.reps;

    return (
      <div style={{
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 2, overflow: "hidden",
        background: "#fff", border: "1px solid #eee",
        borderLeftWidth: 3, borderLeftColor: borderColor,
      }}>
        {/* Repeat badge */}
        <div style={{
          display: "flex", alignItems: "center", padding: "8px 10px",
          borderBottom: "1px solid #f0f0f0", background: "#fafafa",
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#fff",
            background: borderColor, borderRadius: 3,
            padding: "2px 7px", marginRight: 8,
          }}>
            {setsPrefix}{repsCount}×
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>
            {step.label || session.main?.[0]?.description}
          </span>
        </div>

        {/* Work line */}
        <div style={{ padding: "6px 10px 4px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: borderColor, display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>
            {workStr}
          </span>
          <span style={{ fontSize: 11, color: "#888" }}>
            @ {session.main?.[0]?.pace || "—"}/km
          </span>
          <ZoneBadge zone={zone} />
        </div>

        {/* Recovery line */}
        <div style={{ padding: "4px 10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#d0d0d0", display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: "#888" }}>
            récup {recStr} {step.recoveryType || "trot"}
          </span>
          {step.recoveryBetweenSetsSec && step.sets > 1 && (
            <span style={{ fontSize: 11, color: "#aaa" }}>
              · {Math.round(step.recoveryBetweenSetsSec / 60)}min entre séries
            </span>
          )}
        </div>
      </div>
    );
  }

  // Fallback: render each main block as a card (for SL, footing, mixed, etc.)
  return (
    <>
      {session.main.map((block, i) => {
        // Try to find matching step for zone color
        const matchStep = steps[i] || steps[0];
        const zone = matchStep?.paceZone || "Easy";
        const borderColor = matchStep?.stepType === "main" ? zoneColor(zone) : sessionType.color;

        return (
          <div
            key={i}
            style={{
              padding: 10, background: "#fff", borderRadius: 2,
              marginBottom: 6,
              border: "1px solid #eee",
              borderLeftWidth: 3,
              borderLeftColor: borderColor,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, wordBreak: "break-word" }}>
              {block.description}
              {zone !== "Easy" && <ZoneBadge zone={zone} />}
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#888", flexWrap: "wrap" }}>
              {block.duration && <span>⏱ {block.duration}</span>}
              {block.pace && block.pace !== "—" && <span>🏃 {block.pace}/km</span>}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Session Detail Modal ──────────────────────────────────────────────
function SessionDetailModal({ session, paces, onClose }) {
  const [tipsOpen, setTipsOpen] = useState(false);

  if (!session) return null;

  const sessionType = SESSION_TYPES[session.type] || SESSION_TYPES.EF;
  const rpe = session._rpe || (session._dbSteps?.[0]?.rpe) || null;

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
        {/* ── Header ── */}
        <div style={{
          padding: "14px 16px",
          borderBottom: "none",
          background: sessionType.color,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
              {session.dateFormatted}
            </span>
            {/* Type badge pill */}
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
              color: sessionType.color, background: "#fff",
              borderRadius: 3, padding: "1px 6px",
            }}>
              {sessionType.short}
            </span>
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
          {/* RPE gauge */}
          <RpeGauge rpe={rpe} />
        </div>

        {/* ── Intensity Skyline ── */}
        <IntensitySkyline session={session} />

        {/* ── Content ── */}
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
                borderLeft: "3px solid #b0b0b0",
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

          {/* Main — with repeat bracket notation */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#888",
              textTransform: "uppercase", letterSpacing: 1, marginBottom: 6
            }}>
              Corps de séance
            </div>
            <MainBlockContent session={session} sessionType={sessionType} />
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
                borderLeft: "3px solid #b0b0b0",
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

          {/* Coach tips — collapsible */}
          {session.coach_tips && session.coach_tips.length > 0 && (
            <div style={{
              borderRadius: 2,
              border: "1px solid #c8e6c9", marginTop: 10,
              overflow: "hidden",
            }}>
              <div
                style={{
                  padding: "8px 10px",
                  background: tipsOpen ? "#e8f5e9" : "#f1f8f1",
                  cursor: "pointer", userSelect: "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
                onClick={() => setTipsOpen(!tipsOpen)}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#2e7d32",
                  textTransform: "uppercase", letterSpacing: 1,
                }}>
                  Conseils du coach
                </span>
                <span style={{ fontSize: 12, color: "#2e7d32", transform: tipsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  ▼
                </span>
              </div>
              {tipsOpen && (
                <div style={{ padding: "6px 10px 10px", background: "#e8f5e9" }}>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#1b5e20", lineHeight: 1.6 }}>
                    {(Array.isArray(session.coach_tips) ? session.coach_tips : [session.coach_tips]).map((tip, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
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

export default SessionDetailModal;
