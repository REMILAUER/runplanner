// ── Chat Button ───────────────────────────────────────────────────
// Floating action button to open the AI coach chat panel.
// Position: fixed, bottom-right, above the nav bar.

import { FONT, colors } from '../../styles/tokens';

export default function ChatButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ouvrir le coach IA"
      style={{
        position: "fixed",
        bottom: 70,
        right: 16,
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: `2px solid ${colors.primary}`,
        background: colors.primary,
        color: colors.white,
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: 700,
        cursor: "pointer",
        zIndex: 51,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        lineHeight: 1,
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
      }}
    >
      ?
    </button>
  );
}
