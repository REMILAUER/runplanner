// ── Shared styles ──────────────────────────────────────────────────
// Consolidated style objects from App.jsx (lines 549-582).
// Source of truth for all shared inline styles.

import { FONT, colors } from './tokens';

export const s = {
  app: { fontFamily: FONT, maxWidth: 480, margin: "0 auto", padding: "20px 12px 80px", background: colors.background, minHeight: "100vh", color: colors.primary, fontSize: 14, lineHeight: 1.5, boxSizing: "border-box", overflowX: "hidden" },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4, letterSpacing: -0.5, fontFamily: FONT },
  subtitle: { fontSize: 11, color: colors.muted, marginBottom: 24, textTransform: "uppercase", letterSpacing: 1.5 },
  sectionTitle: { fontSize: 15, fontWeight: 700, borderBottom: `2px solid ${colors.primary}`, paddingBottom: 4, marginBottom: 12, marginTop: 28, fontFamily: FONT },
  label: { fontSize: 12, color: "#555", marginBottom: 3, display: "block", fontFamily: FONT },
  input: { fontFamily: FONT, fontSize: 14, border: `1px solid ${colors.border}`, borderRadius: 2, padding: "6px 8px", width: "100%", boxSizing: "border-box", background: colors.white, outline: "none", marginBottom: 10 },
  select: { fontFamily: FONT, fontSize: 14, border: `1px solid ${colors.border}`, borderRadius: 2, padding: "6px 8px", width: "100%", boxSizing: "border-box", background: colors.white, outline: "none", marginBottom: 10, cursor: "pointer" },
  btn: { fontFamily: FONT, fontSize: 12, border: `1px solid ${colors.primary}`, borderRadius: 2, padding: "6px 10px", background: colors.surface, cursor: "pointer", fontWeight: 600, transition: "background 0.1s", whiteSpace: "nowrap" },
  btnPrimary: { fontFamily: FONT, fontSize: 12, border: `2px solid ${colors.primary}`, borderRadius: 2, padding: "8px 14px", background: colors.primary, color: colors.white, cursor: "pointer", fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" },
  row: { display: "flex", gap: 10 },
  half: { flex: 1 },
  nav: { position: "fixed", bottom: 0, left: 0, right: 0, background: colors.background, borderTop: `1px solid #e0e0e0`, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 480, margin: "0 auto", boxSizing: "border-box", zIndex: 50, gap: 4 },
  progressBar: { position: "fixed", top: 0, left: 0, height: 3, background: colors.primary, transition: "width 0.3s ease", zIndex: 200 },
  stepIndicator: { fontSize: 11, color: colors.mutedLight, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 },
  editBtn: { fontFamily: FONT, fontSize: 11, border: `1px solid ${colors.border}`, borderRadius: 2, padding: "3px 10px", background: colors.white, cursor: "pointer", fontWeight: 600, color: "#555", marginLeft: 8 },
  summarySection: { marginBottom: 16, padding: "10px 0", borderBottom: `1px solid ${colors.separator}` },
  summarySectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  summarySectionTitle: { fontWeight: 700, fontSize: 13, fontFamily: FONT },
  summaryDetail: { fontSize: 13, color: "#555", lineHeight: 1.6 },
  dateSuggestion: { fontFamily: FONT, fontSize: 11, color: colors.muted, padding: "4px 8px", cursor: "pointer", borderBottom: `1px solid ${colors.surface}` },
  counter: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  counterBtn: { fontFamily: FONT, fontSize: 16, border: `1px solid ${colors.border}`, borderRadius: 2, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: colors.surface, cursor: "pointer", fontWeight: 700, lineHeight: 1, padding: 0 },
  counterValue: { fontFamily: FONT, fontSize: 20, fontWeight: 700, minWidth: 30, textAlign: "center" },
  tag: (type) => {
    const c = { Prioritaire: { bg: colors.primary, color: colors.white }, Secondaire: { bg: "#e0e0e0", color: colors.primary }, Annexe: { bg: colors.white, color: colors.muted, border: `1px solid ${colors.border}` } }[type] || { bg: colors.white, color: colors.muted, border: `1px solid ${colors.border}` };
    return { fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 2, background: c.bg, color: c.color, border: c.border || "none", textTransform: "uppercase", letterSpacing: 1, display: "inline-block" };
  },
  deleteBtn: { fontFamily: FONT, fontSize: 11, border: "none", background: "none", color: colors.error, cursor: "pointer", padding: "2px 6px", fontWeight: 600 },
  objectiveRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${colors.separator}` },
};

export const genderBtn = (active) => ({
  fontFamily: FONT, fontSize: 13,
  border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
  borderRadius: 2, padding: "6px 16px",
  background: active ? colors.primary : colors.white,
  color: active ? colors.white : colors.primary,
  cursor: "pointer", fontWeight: active ? 700 : 400, transition: "all 0.1s",
});

export const dayBtn = (active) => ({
  fontFamily: FONT, fontSize: 12,
  border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
  borderRadius: 2, padding: "6px 0",
  background: active ? colors.primary : colors.white,
  color: active ? colors.white : colors.primary,
  cursor: "pointer", fontWeight: active ? 700 : 400, flex: 1, textAlign: "center",
});
