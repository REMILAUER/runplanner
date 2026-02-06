import { useState, useMemo } from 'react';
import { FONT } from '../styles/tokens';
import { s } from '../styles/styles';
import { PHASE_COLORS, PHASE_DESCRIPTIONS, SESSION_TYPES } from '../data/constants';
import { generateWeeklyPlan, fmtDist } from '../engine/weekGenerator';
import { generatePlanPDF } from '../engine/pdfExport';
import WeekVolumeBar from '../components/plan/WeekVolumeBar';
import SessionDetailModal from '../components/plan/SessionDetailModal';
import PlanOverviewChart from '../components/plan/PlanOverviewChart';

export default function PlanScreen({ plan, paces, profile, availability, weeklyPlan: weeklyPlanProp }) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  // Use pre-computed weeklyPlan from prop if available, otherwise compute on-the-fly (fallback)
  const weeklyPlan = useMemo(() => {
    if (weeklyPlanProp && Array.isArray(weeklyPlanProp) && weeklyPlanProp.length > 0) {
      return weeklyPlanProp;
    }
    // Fallback: compute on-the-fly (backward compat / no DB)
    const now = new Date();
    const dow = now.getDay();
    const toMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + toMon);
    monday.setHours(0, 0, 0, 0);
    return generateWeeklyPlan(plan, availability, paces, monday);
  }, [weeklyPlanProp, plan, availability, paces]);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      await generatePlanPDF(weeklyPlan, plan, profile, availability, paces);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Erreur lors de l\'export PDF');
    }
    setIsExporting(false);
  };

  if (weeklyPlan.length === 0) {
    return (
      <div>
        <div style={s.sectionTitle}>Votre plan détaillé</div>
        <div style={{ color: "#c00", fontSize: 13, padding: 12, border: "1px solid #c00", borderRadius: 2 }}>
          Impossible de générer le plan détaillé.
        </div>
      </div>
    );
  }

  const currentWeekData = weeklyPlan.find(w => w.week === selectedWeek) || weeklyPlan[0];
  const objective = plan?.cycles?.[0]?.objective;

  const formatDateRange = (start, end) => {
    const s = start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const e = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${s} — ${e}`;
  };

  return (
    <div>
      <div style={s.sectionTitle}>Votre plan semaine par semaine</div>

      {/* Plan header */}
      <div style={{
        padding: 12, background: "#1a1a1a", color: "#fff",
        borderRadius: 2, marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          {objective ? `Préparation ${objective.distance}` : "Plan d'entraînement"}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
          {weeklyPlan.length} sem. · {availability.sessionsPerWeek} séances/sem. · ~{Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.low || w.volume), 0))}-{Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.high || w.volume), 0))}&nbsp;km
        </div>
      </div>

      {/* Global plan overview (mini chart) */}
      <div style={{
        padding: 12, background: "#f8f8f8", borderRadius: 2,
        border: "1px solid #eee", marginBottom: 16,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#888",
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 8
        }}>
          Vue globale — progression du volume
        </div>
        <PlanOverviewChart
          weeklyPlan={weeklyPlan}
          currentWeek={selectedWeek}
          onWeekClick={setSelectedWeek}
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          {Object.entries(PHASE_COLORS).map(([phase, color]) => (
            <div key={phase} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 1, background: color }} />
              <span style={{ fontSize: 10, color: "#666" }}>{phase}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Week selector (horizontal scroll) */}
      <div style={{
        display: "flex", gap: 6, overflowX: "auto",
        paddingBottom: 8, marginBottom: 16,
        scrollbarWidth: "none",
      }}>
        {weeklyPlan.map((w) => {
          const isActive = w.week === selectedWeek;
          const phaseColor = PHASE_COLORS[w.phase] || "#888";
          return (
            <button
              key={w.week}
              onClick={() => setSelectedWeek(w.week)}
              style={{
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                padding: "6px 10px",
                border: isActive ? "2px solid #1a1a1a" : "1px solid #ddd",
                borderRadius: 2,
                background: isActive ? "#1a1a1a" : "#fff",
                color: isActive ? "#fff" : "#1a1a1a",
                cursor: "pointer",
                flexShrink: 0,
                position: "relative",
              }}
            >
              S{w.week}
              <div style={{
                position: "absolute",
                bottom: 2,
                left: "50%",
                transform: "translateX(-50%)",
                width: 4,
                height: 4,
                borderRadius: 2,
                background: isActive ? "#fff" : phaseColor,
                opacity: w.isAssim ? 0.4 : 1,
              }} />
            </button>
          );
        })}
      </div>

      {/* Selected week detail */}
      <div style={{
        border: "2px solid #1a1a1a",
        borderRadius: 2,
        marginBottom: 16,
      }}>
        {/* Week header */}
        <div style={{
          padding: "10px 12px",
          background: PHASE_COLORS[currentWeekData.phase] || "#888",
          borderBottom: "2px solid #1a1a1a",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
                {formatDateRange(currentWeekData.weekStartDate, currentWeekData.weekEndDate)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                Semaine {currentWeekData.week}
                {currentWeekData.isAssim && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, marginLeft: 6,
                    padding: "2px 5px",
                    border: "1px dashed rgba(255,255,255,0.6)",
                    borderRadius: 2,
                  }}>
                    ASSIMILATION
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentWeekData.phase} — {currentWeekData.objective}
              </div>
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
                {fmtDist(currentWeekData.totalDistance)}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>km</div>
            </div>
          </div>

          {/* Volume distribution bar */}
          <div style={{ marginTop: 10 }}>
            <WeekVolumeBar sessions={currentWeekData.sessions} />
          </div>
        </div>

        {/* Sessions list */}
        <div>
          {currentWeekData.sessions.map((session, si) => {
            if (session.isRest) {
              return (
                <div
                  key={si}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: "8px 10px",
                    borderBottom: si < currentWeekData.sessions.length - 1 ? "1px solid #eee" : "none",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ width: 56, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "#bbb", textTransform: "capitalize" }}>
                      {session.date.toLocaleDateString("fr-FR", { weekday: "short" })}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, color: "#bbb" }}>
                      {session.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <div style={{
                    width: 3, height: 28,
                    background: "#e0e0e0",
                    borderRadius: 2,
                    marginRight: 10,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, fontFamily: FONT, color: "#bbb", fontStyle: "italic" }}>
                      Jour off
                    </div>
                  </div>
                </div>
              );
            }
            const sessionType = SESSION_TYPES[session.type] || SESSION_TYPES.EF;
            return (
              <div
                key={si}
                onClick={() => setSelectedSession(session)}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "10px 10px",
                  borderBottom: si < currentWeekData.sessions.length - 1 ? "1px solid #eee" : "none",
                  cursor: "pointer",
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f8f8f8"}
                onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
              >
                {/* Date */}
                <div style={{ width: 56, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "#888", textTransform: "capitalize" }}>
                    {session.date.toLocaleDateString("fr-FR", { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
                    {session.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </div>
                </div>

                {/* Type indicator */}
                <div style={{
                  width: 3, height: 32,
                  background: sessionType.color,
                  borderRadius: 2,
                  marginRight: 10,
                  flexShrink: 0,
                }} />

                {/* Session info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, fontFamily: FONT,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {session.title}
                  </div>
                  <div style={{ fontSize: 10, color: "#888" }}>
                    {session.duration} · {sessionType.short}
                  </div>
                </div>

                {/* Distance + arrow */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontWeight: 700, fontSize: 12, fontFamily: FONT }}>
                      {fmtDist(session.distance)}
                    </span>
                    <span style={{ fontSize: 9, color: "#888" }}>km</span>
                  </div>
                  <span style={{ color: "#ccc", fontSize: 12 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Week summary footer */}
        <div style={{
          padding: "8px 10px",
          background: "#f8f8f8",
          borderTop: "1px solid #eee",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "#888", fontFamily: FONT }}>
            {currentWeekData.sessions.filter(s => !s.isRest).length} séances
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, whiteSpace: "nowrap" }}>
            Total : {fmtDist(currentWeekData.totalDistance)} km
          </span>
        </div>
      </div>

      {/* Phase explanations */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...s.sectionTitle, marginTop: 28, fontSize: 13 }}>Comprendre les 4 phases</div>
        <div>
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

      {/* Export / actions */}
      <div style={{
        padding: 16,
        background: "#f8f8f0",
        border: "2px solid #1a1a1a",
        borderRadius: 2,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: FONT, marginBottom: 8 }}>
          ✓ Plan prêt
        </div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 12 }}>
          Cliquez sur une séance pour voir le détail complet avec échauffement, corps de séance, retour au calme et allures cibles.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            data-export-pdf
            style={{ ...s.btn, opacity: isExporting ? 0.6 : 1 }}
            onClick={handleExportPDF}
            disabled={isExporting}
          >
            {isExporting ? "Export en cours..." : "Exporter PDF"}
          </button>
        </div>
      </div>

      {/* Session detail modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          paces={paces}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
}
