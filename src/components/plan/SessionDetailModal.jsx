import { useState } from 'react';
import { FONT } from '../../styles/tokens';
import { s } from '../../styles/styles';
import { SESSION_TYPES, ZONE_COLORS } from '../../data/constants';
import { fmtDist } from '../../engine/weekGenerator';

// ── Zone intensity heights for skyline (0-1 scale) ──
// More spread-out scale for better visual differentiation
const ZONE_HEIGHTS = {
  Easy: 0.22, Actif: 0.18, Seuil1: 0.48, Tempo: 0.58,
  Seuil2: 0.72, VMALongue: 0.88, VMACourte: 1.0,
};

// Short zone labels for skyline annotations
const ZONE_SHORT = {
  Easy: "EF", Actif: "Actif", Seuil1: "S1", Tempo: "Tempo",
  Seuil2: "S2", VMALongue: "VMAl", VMACourte: "VMA",
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
          segments.push({ dur: workDur, height, color, type: "work", zone });
          if (ri < repsPerSet - 1) {
            segments.push({ dur: recDur, height: 0.15, color: "#d0d0d0", type: "recovery", zone: null });
          }
        }
        if (si < sets - 1) {
          segments.push({ dur: interSetDur, height: 0.12, color: "#d0d0d0", type: "recovery", zone: null });
        }
      }
    } else {
      // Single block (warmup, cooldown, continuous effort, single rep, or mixed segment)
      const dur = step.durationSec || 300; // fallback 5min
      segments.push({ dur, height, color, type: step.stepType === "main" ? "work" : step.stepType, zone });

      // If this main step has recovery (e.g., mixed segment), add recovery bar
      if (step.stepType === "main" && step.recoveryDurationSec && step.recoveryDurationSec > 0) {
        segments.push({
          dur: step.recoveryDurationSec,
          height: 0.15,
          color: "#d0d0d0",
          type: "recovery",
          zone: null,
        });
      }
    }
  }

  return segments;
}

// ── Merge consecutive same-zone work segments for label display ──
function mergeWorkGroups(segments) {
  const groups = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (seg.type === "work") {
      // Group consecutive work+recovery of same color
      const group = { ...seg, segCount: 1, totalDur: seg.dur, startIdx: i };
      let j = i + 1;
      while (j < segments.length) {
        if (segments[j].type === "recovery" && j + 1 < segments.length && segments[j + 1].color === seg.color) {
          group.totalDur += segments[j].dur + segments[j + 1].dur;
          group.segCount++;
          j += 2;
        } else break;
      }
      groups.push(group);
      i = j;
    } else {
      groups.push({ ...seg, segCount: 1, totalDur: seg.dur, startIdx: i });
      i++;
    }
  }
  return groups;
}

// ── Intensity Skyline Component ──
function IntensitySkyline({ session }) {
  const segments = buildSkylineSegments(session);
  if (segments.length === 0) return null;

  const totalDur = segments.reduce((sum, seg) => sum + seg.dur, 0);
  if (totalDur === 0) return null;

  const SKYLINE_H = 80;
  const BAR_H = 64;

  // Build annotation groups for zone labels
  const groups = mergeWorkGroups(segments);
  // Only label main work groups (not warmup/cooldown)
  const labeledGroups = groups.filter(g => g.type === "work" && g.zone);

  return (
    <div style={{
      padding: "0 16px", background: "#f7f7f7",
      borderBottom: "1px solid #e8e8e8",
    }}>
      {/* Skyline bars */}
      <div style={{
        display: "flex", alignItems: "flex-end", height: BAR_H,
        gap: 1, paddingTop: 16,
      }}>
        {segments.map((seg, i) => {
          const widthPct = Math.max(0.4, (seg.dur / totalDur) * 100);
          const isRecovery = seg.type === "recovery";
          return (
            <div
              key={i}
              style={{
                flex: `0 0 ${widthPct}%`,
                height: `${Math.max(3, Math.round(seg.height * BAR_H))}px`,
                background: isRecovery
                  ? `repeating-linear-gradient(45deg, ${seg.color}, ${seg.color} 2px, transparent 2px, transparent 4px)`
                  : seg.color,
                borderRadius: "2px 2px 0 0",
                minWidth: isRecovery ? 3 : 4,
                opacity: isRecovery ? 0.5 : 1,
              }}
            />
          );
        })}
      </div>
      {/* Duration axis labels */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        padding: "3px 0 6px", fontSize: 9, color: "#aaa",
      }}>
        <span>0'</span>
        <span>{Math.round(totalDur / 60)}'</span>
      </div>
    </div>
  );
}

// ── RPE Gauge Component — horizontal bar style ──
function RpeGauge({ rpe }) {
  if (!rpe && rpe !== 0) return null;
  const segments = 10;
  const color = rpeColor(rpe);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.8)",
        letterSpacing: 0.5, minWidth: 24,
      }}>RPE</span>
      <div style={{
        display: "flex", gap: 2, flex: 1, maxWidth: 140,
      }}>
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: 8, borderRadius: 1,
              background: i < rpe ? color : "rgba(255,255,255,0.2)",
              transition: "background 0.15s",
            }}
          />
        ))}
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, color: "#fff",
        minWidth: 30, textAlign: "right",
      }}>
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

// ── Helper: format duration/distance for step display ──
function fmtStepWork(step) {
  if (step.distanceM && !step.durationSec) {
    return step.distanceM >= 1000
      ? `${(step.distanceM / 1000).toFixed(step.distanceM % 1000 === 0 ? 0 : 1)}km`
      : `${step.distanceM}m`;
  }
  if (step.durationSec) {
    return step.durationSec >= 60
      ? `${Math.round(step.durationSec / 60)}min`
      : `${step.durationSec}s`;
  }
  if (step.distanceM) {
    return step.distanceM >= 1000
      ? `${(step.distanceM / 1000).toFixed(step.distanceM % 1000 === 0 ? 0 : 1)}km`
      : `${step.distanceM}m`;
  }
  return "—";
}

function fmtRecovery(step) {
  if (!step.recoveryDurationSec) return null;
  const dur = step.recoveryDurationSec >= 60
    ? `${Math.round(step.recoveryDurationSec / 60)}min`
    : `${step.recoveryDurationSec}s`;
  return `${dur} ${step.recoveryType || "trot"}`;
}

// ── Format pace from step data ──
function fmtStepPace(step) {
  if (step.paceMinSecKm && step.paceMaxSecKm) {
    const fmtP = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.round(s % 60);
      return `${m}:${sec.toString().padStart(2, "0")}`;
    };
    return `${fmtP(step.paceMinSecKm)}-${fmtP(step.paceMaxSecKm)}`;
  }
  return null;
}

// ── Main block renderer — uniform card style from _dbSteps ──
function MainBlockContent({ session, sessionType }) {
  const steps = session._dbSteps?.filter(st => st.stepType === "main") || [];

  // ── Path A: Single step with reps > 1 → repeat bracket notation ──
  if (steps.length === 1 && steps[0].reps && steps[0].reps > 1) {
    const step = steps[0];
    const zone = step.paceZone || "Easy";
    const borderColor = zoneColor(zone);

    const workStr = fmtStepWork(step);
    const recStr = fmtRecovery(step);
    const paceStr = fmtStepPace(step);

    // Sets notation
    const setsPrefix = step.sets && step.sets > 1 ? `${step.sets} × ` : "";
    const repsCount = step.reps;

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
          <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
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
          {paceStr && (
            <span style={{ fontSize: 11, color: "#888" }}>
              @ {paceStr}/km
            </span>
          )}
          <ZoneBadge zone={zone} />
        </div>

        {/* Recovery line */}
        {recStr && (
          <div style={{ padding: "4px 10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#d0d0d0", display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: "#888" }}>
              récup {recStr}
            </span>
            {step.recoveryBetweenSetsSec && step.sets > 1 && (
              <span style={{ fontSize: 11, color: "#aaa" }}>
                · {Math.round(step.recoveryBetweenSetsSec / 60)}min entre séries
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Path B: Multiple structured steps (mixed sessions, SL segments) → uniform card per step ──
  if (steps.length > 1) {
    // Detect if this is a segment-based session (SL/footing with fraction-based segments)
    const isSegmentSession = session.type === "SL" || session.type === "EF";

    return (
      <>
        {steps.map((step, i) => {
          const zone = step.paceZone || "Easy";
          const borderColor = zoneColor(zone);
          const workStr = fmtStepWork(step);
          const recStr = fmtRecovery(step);
          const paceStr = fmtStepPace(step);

          const mainBlock = session.main?.[i];

          // For SL/footing segment sessions: use the label (e.g. "6 × 3min Actif") as primary
          // and show duration + pace as secondary info
          let displayLabel, displaySub;
          if (isSegmentSession) {
            displayLabel = step.label || mainBlock?.description || "—";
            displaySub = mainBlock ? `${mainBlock.duration} @ ${mainBlock.pace}/km` : step.description;
          } else {
            const hasStructuredWork = workStr !== "—";
            displayLabel = hasStructuredWork ? workStr : (mainBlock?.description || step.label || "—");
            displaySub = hasStructuredWork ? step.description : (mainBlock ? `${mainBlock.duration} @ ${mainBlock.pace}/km` : null);
          }

          return (
            <div
              key={i}
              style={{
                background: "#fff", borderRadius: 2,
                marginBottom: 6,
                border: "1px solid #eee",
                borderLeftWidth: 3,
                borderLeftColor: borderColor,
                overflow: "hidden",
              }}
            >
              {/* Segment header */}
              <div style={{
                padding: "6px 10px", display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: borderColor, display: "inline-block", flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>
                  {displayLabel}
                </span>
                {!isSegmentSession && paceStr && (
                  <span style={{ fontSize: 11, color: "#888" }}>
                    @ {paceStr}/km
                  </span>
                )}
                <ZoneBadge zone={zone} />
              </div>
              {displaySub && (
                <div style={{ padding: "0 10px 4px 26px", fontSize: 11, color: "#888" }}>
                  {displaySub}
                </div>
              )}
              {/* Recovery line */}
              {recStr && (
                <div style={{
                  padding: "2px 10px 6px", display: "flex", alignItems: "center", gap: 8,
                  borderTop: "1px dashed #f0f0f0",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "#d0d0d0", display: "inline-block", flexShrink: 0, marginLeft: 1,
                  }} />
                  <span style={{ fontSize: 11, color: "#aaa" }}>
                    récup {recStr}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  }

  // ── Path C: Fallback — render from session.main blocks (SL, footing, etc.) ──
  return (
    <>
      {session.main.map((block, i) => {
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
          padding: "16px 16px 14px",
          background: sessionType.color,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
              {session.dateFormatted}
            </span>
            {/* Type badge pill */}
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
              color: sessionType.color, background: "rgba(255,255,255,0.95)",
              borderRadius: 3, padding: "2px 7px",
            }}>
              {sessionType.short}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
            {session.title}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
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

          {/* Conseils — collapsible, merges notes + coach_tips */}
          {(session.notes || (session.coach_tips && session.coach_tips.length > 0)) && (
            <div style={{
              borderRadius: 4, overflow: "hidden",
              border: "1px solid #f0e6c0",
              background: "#fffbeb",
            }}>
              <div
                style={{
                  padding: "8px 10px",
                  cursor: "pointer", userSelect: "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
                onClick={() => setTipsOpen(!tipsOpen)}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#8a7a3a",
                  textTransform: "uppercase", letterSpacing: 1,
                }}>
                  💡 Conseils
                </span>
                <span style={{
                  fontSize: 10, color: "#8a7a3a",
                  transform: tipsOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}>▼</span>
              </div>
              {tipsOpen && (
                <div style={{ padding: "0 10px 10px" }}>
                  {session.notes && (
                    <div style={{ fontSize: 12, color: "#5a5030", lineHeight: 1.6, marginBottom: session.coach_tips ? 8 : 0 }}>
                      {session.notes}
                    </div>
                  )}
                  {session.coach_tips && session.coach_tips.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#5a5030", lineHeight: 1.6 }}>
                      {(Array.isArray(session.coach_tips) ? session.coach_tips : [session.coach_tips]).map((tip, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>{tip}</li>
                      ))}
                    </ul>
                  )}
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
