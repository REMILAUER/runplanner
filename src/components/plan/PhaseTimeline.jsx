import { FONT } from '../../styles/tokens';
import { PHASE_COLORS } from '../../data/constants';

function PhaseTimeline({ schedule }) {
  if (!schedule || schedule.length === 0) return null;

  // Group consecutive weeks by phase
  const groups = [];
  let current = null;
  schedule.forEach((w) => {
    if (!current || current.phase !== w.phase) {
      current = { phase: w.phase, weeks: [w] };
      groups.push(current);
    } else {
      current.weeks.push(w);
    }
  });

  const totalWeeks = schedule.length;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Timeline bar */}
      <div style={{ display: "flex", height: 28, borderRadius: 2, overflow: "hidden", border: "1px solid #e0e0e0" }}>
        {groups.map((g, i) => {
          const pct = (g.weeks.length / totalWeeks) * 100;
          const color = PHASE_COLORS[g.phase] || "#ccc";
          return (
            <div key={i} style={{
              width: `${pct}%`,
              background: color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontFamily: FONT, fontWeight: 700, color: "#fff",
              letterSpacing: 0.5,
              borderRight: i < groups.length - 1 ? "1px solid rgba(255,255,255,0.3)" : "none",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "0 2px",
            }}>
              {g.weeks.length >= 2 ? `${g.weeks.length}s` : ""}
            </div>
          );
        })}
      </div>
      {/* Phase labels below */}
      <div style={{ display: "flex", marginTop: 4 }}>
        {groups.map((g, i) => {
          const pct = (g.weeks.length / totalWeeks) * 100;
          return (
            <div key={i} style={{
              width: `${pct}%`, textAlign: "center",
              fontSize: 9, fontFamily: FONT, color: "#888",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              padding: "0 1px",
            }}>
              {g.weeks.length >= 3 ? g.phase : g.phase.charAt(0)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PhaseTimeline;
