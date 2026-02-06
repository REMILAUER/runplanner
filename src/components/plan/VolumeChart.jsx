import { FONT } from '../../styles/tokens';
import { PHASE_COLORS } from '../../data/constants';

function VolumeChart({ schedule, cycleIndex }) {
  if (!schedule || schedule.length === 0) return null;

  const chartWidth = 440;
  const chartHeight = 180;
  const padTop = 20;
  const padBottom = 30;
  const padLeft = 40;
  const padRight = 12;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const maxVol = Math.max(...schedule.map(w => w.volume));
  const yMax = maxVol * 1.12;
  const yMin = 0;

  const barWidth = Math.max(4, Math.min(20, (innerW / schedule.length) - 2));
  const gap = (innerW - barWidth * schedule.length) / Math.max(1, schedule.length - 1);

  const getX = (i) => padLeft + i * (barWidth + gap);
  const getY = (vol) => padTop + innerH - ((vol - yMin) / (yMax - yMin)) * innerH;

  // Y-axis grid lines
  const gridCount = 4;
  const gridStep = (yMax - yMin) / gridCount;
  const gridLines = [];
  for (let i = 0; i <= gridCount; i++) {
    const val = yMin + gridStep * i;
    gridLines.push({ val: Math.round(val), y: getY(val) });
  }

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ display: "block", marginBottom: 8 }}>
      {/* Grid */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padLeft} y1={g.y} x2={chartWidth - padRight} y2={g.y} stroke="#e8e8e8" strokeWidth="1" />
          <text x={padLeft - 4} y={g.y + 3} textAnchor="end" fontSize="9" fontFamily={FONT} fill="#aaa">{g.val}</text>
        </g>
      ))}

      {/* Bars */}
      {schedule.map((w, i) => {
        const x = getX(i);
        const y = getY(w.volume);
        const h = padTop + innerH - y;
        const color = PHASE_COLORS[w.phase] || "#ccc";
        const isAssim = w.isAssim;

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, h)}
              fill={isAssim ? "none" : color}
              stroke={isAssim ? color : "none"}
              strokeWidth={isAssim ? 1.5 : 0}
              strokeDasharray={isAssim ? "3,2" : "none"}
              rx="1"
              opacity={isAssim ? 0.7 : 0.85}
            />
            {/* Assimilation marker */}
            {isAssim && (
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize="7" fontFamily={FONT} fill={color} fontWeight="700">↓</text>
            )}
            {/* Volume label on hover area — show every N weeks */}
            {(i === 0 || i === schedule.length - 1 || (i + 1) % Math.max(1, Math.ceil(schedule.length / 8)) === 0) && (
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="8" fontFamily={FONT} fill="#888" fontWeight="600">
                {Math.round(w.volume)}
              </text>
            )}
          </g>
        );
      })}

      {/* X-axis week labels */}
      {schedule.map((w, i) => {
        const x = getX(i) + barWidth / 2;
        const show = schedule.length <= 16 || (i + 1) % Math.max(1, Math.ceil(schedule.length / 12)) === 0 || i === 0;
        if (!show) return null;
        return (
          <text key={`xl-${i}`} x={x} y={chartHeight - 6} textAnchor="middle" fontSize="8" fontFamily={FONT} fill="#aaa">
            S{w.week}
          </text>
        );
      })}

      {/* Y-axis label */}
      <text x={4} y={padTop - 6} fontSize="8" fontFamily={FONT} fill="#aaa">km</text>
    </svg>
  );
}

export default VolumeChart;
