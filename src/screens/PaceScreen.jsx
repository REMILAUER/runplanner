import { useState } from 'react';
import { DISTANCE_METERS, PACE_ORDER, ZONE_COLORS } from '../data/constants';
import { FONT } from '../styles/tokens';
import { s } from '../styles/styles';
import { parseTimeToSeconds, computeVDOT, formatPace } from '../engine/vdot';
import InfoTooltip from '../components/ui/InfoTooltip';

export default function PaceScreen({ profile, paces, onPacesChange }) {
  const [editing, setEditing] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [editPaces, setEditPaces] = useState(null);

  const vdot = computeVDOT(
    DISTANCE_METERS[profile.refDistance] || 10000,
    parseTimeToSeconds(profile.refTime || "40:00")
  );

  const handleEditClick = () => {
    if (!editing) { setShowWarning(true); } else {
      if (editPaces) onPacesChange(editPaces);
      setEditing(false); setEditPaces(null);
    }
  };

  const confirmEdit = () => {
    setShowWarning(false); setEditing(true);
    const copy = {};
    Object.keys(paces).forEach((k) => { copy[k] = { ...paces[k] }; });
    setEditPaces(copy);
  };

  const cancelEdit = () => { setEditing(false); setEditPaces(null); };

  const updatePace = (zone, bound, val) => {
    const parts = val.split(":").map(Number);
    let sec = 0;
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) sec = parts[0] * 60 + parts[1];
    if (sec > 0) setEditPaces((prev) => ({ ...prev, [zone]: { ...prev[zone], [bound]: sec } }));
  };

  const displayPaces = editing && editPaces ? editPaces : paces;

  return (
    <div>
      <div style={s.sectionTitle}>Vos allures d'entraînement</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6, lineHeight: 1.6 }}>
        Calculées à partir de votre course référence ({profile.refDistance} en {profile.refTime}).
      </div>
      <div style={{ display: "inline-block", padding: "4px 10px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: 2, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
        Score VDOT : {vdot.toFixed(1)}
        <InfoTooltip text={`Le VDOT est un indice de performance dérivé de votre course référence (méthode Jack Daniels). Il sert de base unique pour calculer toutes vos allures d'entraînement.\n\nPlus votre VDOT est élevé, plus vous êtes performant.`} />
      </div>
      <div style={{ marginBottom: 12 }}>
        {PACE_ORDER.map((zone) => {
          const p = displayPaces[zone];
          if (!p) return null;
          const color = ZONE_COLORS[zone] || "#888";
          return (
            <div key={zone} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ width: 4, height: 36, background: color, borderRadius: 2, marginRight: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.label || zone}</div>
                <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>{p.desc}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 85, flexShrink: 0 }}>
                {editing ? (
                  <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "flex-end" }}>
                    <input style={{ ...s.input, width: 48, marginBottom: 0, textAlign: "center", fontSize: 12, padding: "4px" }} defaultValue={formatPace(p.fast)} onBlur={(e) => updatePace(zone, "fast", e.target.value)} />
                    <span style={{ fontSize: 10, color: "#aaa" }}>→</span>
                    <input style={{ ...s.input, width: 48, marginBottom: 0, textAlign: "center", fontSize: 12, padding: "4px" }} defaultValue={formatPace(p.slow)} onBlur={(e) => updatePace(zone, "slow", e.target.value)} />
                  </div>
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 13, fontFamily: FONT, whiteSpace: "nowrap" }}>
                    {formatPace(p.fast)} → {formatPace(p.slow)}
                    <div style={{ fontSize: 10, color: "#aaa", fontWeight: 400 }}>/km</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={s.btn} onClick={handleEditClick}>{editing ? "Sauvegarder ✓" : "Éditer les allures ✎"}</button>
        {editing && <button style={{ ...s.btn, color: "#c00", borderColor: "#c00" }} onClick={cancelEdit}>Annuler</button>}
      </div>
      {showWarning && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowWarning(false)}>
          <div style={{ background: "#fdfdfd", border: "2px solid #c00", borderRadius: 2, padding: 20, width: "90%", maxWidth: 400, fontFamily: FONT }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#c00" }}>⚠ Attention</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", marginBottom: 8 }}>
              Vos allures sont calibrées à partir de votre performance réelle. Elles sont conçues pour maximiser votre progression tout en limitant le risque de blessure.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>Augmenter les allures ne vous fera pas progresser plus vite.</span> Au contraire, cela augmente significativement le risque de surentraînement et de blessure.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", marginBottom: 16 }}>
              Si vous estimez que vos allures sont sous-calibrées, nous recommandons de suivre le plan tel quel pendant 4 semaines, puis de refaire un test de référence pour recalibrer.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={s.btn} onClick={() => setShowWarning(false)}>Garder mes allures</button>
              <button style={{ ...s.btn, background: "#fff3f3", borderColor: "#c00", color: "#c00" }} onClick={confirmEdit}>Modifier quand même</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
