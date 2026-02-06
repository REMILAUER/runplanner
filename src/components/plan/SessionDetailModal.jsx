import { FONT } from '../../styles/tokens';
import { s } from '../../styles/styles';
import { SESSION_TYPES } from '../../data/constants';
import { fmtDist } from '../../engine/weekGenerator';

// Session detail modal
function SessionDetailModal({ session, paces, onClose }) {
  if (!session) return null;

  const sessionType = SESSION_TYPES[session.type] || SESSION_TYPES.EF;

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
        {/* Header */}
        <div style={{
          padding: "14px 16px",
          borderBottom: "2px solid #1a1a1a",
          background: sessionType.color,
        }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
            {session.dateFormatted}
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
        </div>

        {/* Content */}
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
                borderLeft: "3px solid #7ec8e3",
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

          {/* Main */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#888",
              textTransform: "uppercase", letterSpacing: 1, marginBottom: 6
            }}>
              Corps de séance
            </div>
            {session.main.map((block, i) => (
              <div
                key={i}
                style={{
                  padding: 10, background: "#fff", borderRadius: 2,
                  borderLeft: `3px solid ${sessionType.color}`,
                  marginBottom: 6,
                  border: "1px solid #eee",
                  borderLeftWidth: 3,
                  borderLeftColor: sessionType.color,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, wordBreak: "break-word" }}>
                  {block.description}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#888", flexWrap: "wrap" }}>
                  {block.duration && <span>⏱ {block.duration}</span>}
                  {block.pace && block.pace !== "—" && <span>🏃 {block.pace}/km</span>}
                </div>
              </div>
            ))}
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
                borderLeft: "3px solid #9e9e9e",
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

          {/* Coach tips */}
          {session.coach_tips && session.coach_tips.length > 0 && (
            <div style={{
              padding: 10, background: "#e8f5e9", borderRadius: 2,
              border: "1px solid #c8e6c9", marginTop: 10,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#2e7d32",
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
              }}>
                Conseils du coach
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#1b5e20", lineHeight: 1.6 }}>
                {(Array.isArray(session.coach_tips) ? session.coach_tips : [session.coach_tips]).map((tip, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{tip}</li>
                ))}
              </ul>
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
