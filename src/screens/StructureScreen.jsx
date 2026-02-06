import { FONT } from '../styles/tokens';
import { s } from '../styles/styles';
import { PHASE_COLORS, PHASE_DESCRIPTIONS } from '../data/constants';
import { computeStartingVolume } from '../engine/periodization';
import VolumeChart from '../components/plan/VolumeChart';
import PhaseTimeline from '../components/plan/PhaseTimeline';

export default function StructureScreen({ plan, history, profile }) {
  if (!plan || !plan.cycles || plan.cycles.length === 0) {
    return (
      <div>
        <div style={s.sectionTitle}>Structure du plan</div>
        <div style={{ color: "#c00", fontSize: 13, padding: 12, border: "1px solid #c00", borderRadius: 2 }}>
          Impossible de générer le plan. Vérifiez vos objectifs et votre historique.
        </div>
      </div>
    );
  }

  const startingVol = computeStartingVolume(
    parseFloat(history.avgWeekKm) || 40,
    parseFloat(history.lastWeekKm) || 40
  );

  return (
    <div>
      <div style={s.sectionTitle}>Structure du plan</div>

      <div style={{ fontSize: 12, color: "#666", marginBottom: 4, lineHeight: 1.6 }}>
        Périodisation calculée à partir de votre volume actuel ({Math.round(startingVol)} km/sem) et de vos objectifs.
      </div>

      {/* Warnings */}
      {plan.warnings.length > 0 && (
        <div style={{ margin: "12px 0", padding: 10, background: "#fff8f0", border: "1px solid #e8c840", borderRadius: 2 }}>
          {plan.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: "#8a6d00", lineHeight: 1.6, marginBottom: i < plan.warnings.length - 1 ? 4 : 0 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* Cycles */}
      {plan.cycles.map((cycle, ci) => {
        const { phases, volumeSchedule, objective } = cycle;
        const fmt = (d) => {
          if (!d) return "";
          const dt = d instanceof Date ? d : new Date(d + "T00:00:00");
          return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        };

        if (!phases.valid) {
          return (
            <div key={ci} style={{ margin: "16px 0", padding: 12, border: "1px solid #c00", borderRadius: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#c00", marginBottom: 4 }}>
                ❌ Cycle {ci + 1} — invalide
              </div>
              {phases.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11, color: "#c00" }}>→ {w}</div>
              ))}
            </div>
          );
        }

        const totalWeeks = phases.base + phases.construction + phases.specific + phases.taper;
        const peakVol = volumeSchedule.length > 0 ? Math.max(...volumeSchedule.map(w => w.volume)) : 0;
        const assimCount = volumeSchedule.filter(w => w.isAssim).length;

        return (
          <div key={ci} style={{ marginTop: 20 }}>
            {/* Cycle header */}
            <div style={{
              padding: "8px 12px",
              background: "#1a1a1a", color: "#fff",
              borderRadius: "2px 2px 0 0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT }}>
                  {objective ? `Préparation ${objective.distance} sur ${totalWeeks} semaines` : `Préparation continue`}
                </span>
              </div>
              <span style={{ fontSize: 11, fontFamily: FONT, color: "#aaa" }}>
                {objective ? fmt(objective.date) : ""}
              </span>
            </div>

            <div style={{ border: "1px solid #e0e0e0", borderTop: "none", borderRadius: "0 0 2px 2px", padding: 12 }}>
              {/* Cycle warnings */}
              {phases.warnings.length > 0 && (
                <div style={{ marginBottom: 10, padding: 8, background: "#fff8f0", border: "1px solid #e8c840", borderRadius: 2 }}>
                  {phases.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#8a6d00", lineHeight: 1.5 }}>⚠ {w}</div>
                  ))}
                </div>
              )}

              {/* Phase breakdown row */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  { label: "Base", val: phases.base },
                  { label: "Construction", val: phases.construction },
                  { label: "Spécifique", val: phases.specific },
                  { label: "Affûtage", val: phases.taper },
                ].filter(p => p.val > 0).map((p) => (
                  <div key={p.label} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px",
                    background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 2,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: 1, background: PHASE_COLORS[p.label] || "#ccc" }} />
                    <span style={{ fontSize: 11, fontFamily: FONT, fontWeight: 600 }}>{p.label}</span>
                    <span style={{ fontSize: 11, fontFamily: FONT, color: "#888" }}>{p.val}s</span>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, fontFamily: FONT }}>
                  <span style={{ color: "#888" }}>Pic volume</span>{" "}
                  <span style={{ fontWeight: 700 }}>{Math.round(peakVol)} km</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: FONT }}>
                  <span style={{ color: "#888" }}>Assimilations</span>{" "}
                  <span style={{ fontWeight: 700 }}>{assimCount}</span>
                </div>
                {phases.taperType !== "none" && (
                  <div style={{ fontSize: 11, fontFamily: FONT }}>
                    <span style={{ color: "#888" }}>Affûtage</span>{" "}
                    <span style={{ fontWeight: 700 }}>{phases.taperType}</span>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <PhaseTimeline schedule={volumeSchedule} />

              {/* Volume chart */}
              <VolumeChart schedule={volumeSchedule} cycleIndex={ci} />

              {/* Week table */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", padding: "4px 0", borderBottom: "1.5px solid #1a1a1a" }}>
                  <span style={{ width: 36, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textTransform: "uppercase" }}>Sem</span>
                  <span style={{ flex: 1, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textTransform: "uppercase" }}>Phase</span>
                  <span style={{ width: 60, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textAlign: "right", textTransform: "uppercase" }}>Volume</span>
                  <span style={{ width: 50, fontSize: 9, fontWeight: 700, fontFamily: FONT, color: "#888", textAlign: "right", textTransform: "uppercase" }}>Δ</span>
                </div>
                {volumeSchedule.map((w, i) => {
                  const prevVol = i > 0 ? volumeSchedule[i - 1].volume : null;
                  const delta = prevVol ? ((w.volume - prevVol) / prevVol * 100) : 0;
                  const deltaStr = prevVol ? `${delta >= 0 ? "+" : ""}${Math.round(delta)}%` : "";
                  const color = PHASE_COLORS[w.phase] || "#ccc";

                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", padding: "5px 0",
                      borderBottom: "1px solid #f2f2f2",
                      background: w.isAssim ? "#fafafa" : "transparent",
                    }}>
                      <span style={{ width: 36, fontSize: 12, fontWeight: 600, fontFamily: FONT }}>
                        {w.week}
                      </span>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 1, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontFamily: FONT, color: "#555" }}>
                          {w.phase}
                        </span>
                        {w.isAssim && (
                          <span style={{
                            fontSize: 9, fontFamily: FONT, fontWeight: 700,
                            padding: "1px 5px", border: "1px dashed #aaa", borderRadius: 2, color: "#888",
                          }}>
                            ASSIM
                          </span>
                        )}
                      </div>
                      <span style={{ width: 60, textAlign: "right", fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
                        {Math.round(w.volume)}
                        <span style={{ fontWeight: 400, fontSize: 10, color: "#aaa" }}> km</span>
                      </span>
                      <span style={{
                        width: 50, textAlign: "right", fontSize: 11, fontFamily: FONT,
                        color: delta < -10 ? "#2a6e2a" : delta < 0 ? "#666" : delta > 15 ? "#c00" : "#888",
                        fontWeight: Math.abs(delta) > 15 ? 700 : 400,
                      }}>
                        {deltaStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Phase legend — below cycles */}
      <div style={{ ...s.sectionTitle, marginTop: 28, fontSize: 13 }}>Comprendre les 4 phases</div>
      <div style={{ marginBottom: 20 }}>
        {["Base", "Construction", "Spécifique", "Affûtage"].map((phase) => {
          const info = PHASE_DESCRIPTIONS[phase];
          const color = PHASE_COLORS[phase];
          return (
            <div key={phase} style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ width: 4, height: 44, background: color, borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT }}>
                  <span style={{ marginRight: 6 }}>{info.icon}</span>
                  {info.title}
                  <span style={{ fontWeight: 400, fontSize: 11, color: "#888", marginLeft: 8 }}>{info.subtitle}</span>
                </div>
                <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5, marginTop: 2 }}>{info.desc}</div>
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
          <div style={{ width: 4, height: 20, border: "1.5px dashed #aaa", borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 700, fontSize: 12, fontFamily: FONT }}>↓ Assimilation</span>
            <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Semaines de décharge pour absorber la charge</span>
          </div>
        </div>
      </div>
    </div>
  );
}
