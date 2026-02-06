import { useState, useRef, useEffect } from 'react';
import { FONT } from '../../styles/tokens';

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block", marginLeft: 6, verticalAlign: "middle" }}>
      <span onClick={() => setOpen(!open)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        style={{ fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #999", fontSize: 11, fontWeight: 700, color: "#888", cursor: "pointer", userSelect: "none", lineHeight: 1 }}>
        i
      </span>
      {open && (
        <span style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", color: "#eee", fontSize: 11, lineHeight: 1.5, fontFamily: FONT, padding: "10px 12px", borderRadius: 3, width: 280, zIndex: 300, boxShadow: "0 4px 16px rgba(0,0,0,0.25)", whiteSpace: "pre-line" }}>
          {text}
          <span style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1a1a1a" }} />
        </span>
      )}
    </span>
  );
}

export default InfoTooltip;
