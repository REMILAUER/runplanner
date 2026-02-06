import { SESSION_TYPES } from '../../data/constants';
import { distMid } from '../../engine/weekGenerator';

// Mini volume chart for week view
function WeekVolumeBar({ sessions }) {
  const trainingSessions = sessions.filter(s => !s.isRest);
  const total = trainingSessions.reduce((sum, s) => sum + distMid(s.distance), 0);
  if (total === 0) return null;

  return (
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#eee" }}>
      {trainingSessions.map((s, i) => {
        const pct = (distMid(s.distance) / total) * 100;
        const color = SESSION_TYPES[s.type]?.color || "#ccc";
        return (
          <div key={i} style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? 2 : 0 }} />
        );
      })}
    </div>
  );
}

export default WeekVolumeBar;
