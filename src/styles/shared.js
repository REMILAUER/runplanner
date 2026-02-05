/**
 * Shared Styles
 * Common style objects used across components
 */

export const FONT = "'IBM Plex Mono', 'Courier New', monospace";

export const baseStyles = {
  // Layout
  container: {
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100vh",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
  },
  
  // Typography
  h1: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: FONT,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  h2: {
    fontSize: 18,
    fontWeight: 600,
    fontFamily: FONT,
    margin: 0,
  },
  h3: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: FONT,
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: FONT,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#888",
    marginBottom: 6,
  },
  mono: {
    fontFamily: FONT,
  },
  
  // Inputs
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 15,
    fontFamily: FONT,
    border: "2px solid #1a1a1a",
    borderRadius: 0,
    background: "#fff",
    outline: "none",
    transition: "border-color 0.15s",
  },
  select: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 15,
    fontFamily: FONT,
    border: "2px solid #1a1a1a",
    borderRadius: 0,
    background: "#fff",
    outline: "none",
    cursor: "pointer",
    appearance: "none",
  },
  
  // Buttons
  btn: {
    padding: "10px 20px",
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: 600,
    border: "2px solid #1a1a1a",
    borderRadius: 0,
    background: "#fff",
    cursor: "pointer",
    transition: "all 0.15s",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  btnPrimary: {
    padding: "14px 28px",
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: 600,
    border: "2px solid #1a1a1a",
    borderRadius: 0,
    background: "#1a1a1a",
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.15s",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  btnSmall: {
    padding: "6px 12px",
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: 600,
    border: "2px solid #1a1a1a",
    borderRadius: 0,
    background: "#fff",
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  
  // Cards
  card: {
    border: "2px solid #1a1a1a",
    padding: 16,
    marginBottom: 12,
    background: "#fff",
  },
  cardHover: {
    border: "2px solid #1a1a1a",
    padding: 16,
    marginBottom: 12,
    background: "#fff",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  
  // Badges
  badge: {
    display: "inline-block",
    padding: "4px 10px",
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderRadius: 0,
  },
  
  // Progress
  progressBar: {
    height: 4,
    background: "#eee",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#1a1a1a",
    transition: "width 0.3s ease",
  },
  
  // Navigation
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderTop: "2px solid #1a1a1a",
    background: "#fff",
    position: "sticky",
    bottom: 0,
  },
  
  // Header
  header: {
    padding: "20px 20px 16px",
    borderBottom: "2px solid #1a1a1a",
  },
  
  // Content
  content: {
    flex: 1,
    padding: 20,
    overflowY: "auto",
  },
  
  // Colors
  colors: {
    primary: "#1a1a1a",
    secondary: "#888",
    border: "#1a1a1a",
    background: "#fff",
    backgroundAlt: "#fafafa",
    accent: "#007AFF",
    success: "#4a9e4a",
    warning: "#e8873c",
    error: "#d63031",
  },
};

export default baseStyles;
