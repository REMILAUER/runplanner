import { PHASE_COLORS } from '../../data/constants';

// Global plan overview mini-chart
function PlanOverviewChart({ weeklyPlan, currentWeek, onWeekClick }) {
  if (!weeklyPlan || weeklyPlan.length === 0) return null;

  const maxVol = Math.max(...weeklyPlan.map(w => w.volume));
  const chartHeight = 60;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 2,
        height: chartHeight,
        padding: "0 2px",
      }}>
        {weeklyPlan.map((w, i) => {
          const h = (w.volume / maxVol) * chartHeight;
          const color = PHASE_COLORS[w.phase] || "#ccc";
          const isActive = w.week === currentWeek;

          return (
            <div
              key={i}
              onClick={() => onWeekClick(w.week)}
              style={{
                flex: 1,
                height: h,
                background: isActive ? "#1a1a1a" : color,
                borderRadius: "2px 2px 0 0",
                cursor: "pointer",
                opacity: w.isAssim ? 0.5 : 0.85,
                border: isActive ? "2px solid #1a1a1a" : "none",
                boxSizing: "border-box",
                transition: "all 0.15s ease",
              }}
              title={`S${w.week} — ${w.volume}km`}
            />
          );
        })}
      </div>
      {/* Phase labels */}
      <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
        {(() => {
          // Group by phase
          const groups = [];
          let current = null;
          weeklyPlan.forEach((w, i) => {
            if (!current || current.phase !== w.phase) {
              current = { phase: w.phase, count: 1, start: i };
              groups.push(current);
            } else {
              current.count++;
            }
          });
          return groups.map((g, i) => (
            <div
              key={i}
              style={{
                flex: g.count,
                fontSize: 8,
                textAlign: "center",
                color: "#888",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {g.count >= 3 ? g.phase : ""}
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

export default PlanOverviewChart;
