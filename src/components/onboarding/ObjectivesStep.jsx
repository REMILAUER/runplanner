import { useState } from 'react';
import { FONT } from '../../styles/tokens';
import { s, genderBtn } from '../../styles/styles';
import { OBJECTIVE_DISTANCES, OBJ_TYPES } from '../../data/constants';
import { FUTURE_DATES } from '../../engine/weekGenerator';
import InfoTooltip from '../ui/InfoTooltip';

function ObjectiveModal({ onClose, onAdd }) {
  const [obj, setObj] = useState({ date: "", distance: "", type: "" });
  const [showSugg, setShowSugg] = useState(true);
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div style={{ background: "#fdfdfd", border: "2px solid #1a1a1a", borderRadius: 2, padding: 20, width: "90%", maxWidth: 400, fontFamily: FONT }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Nouvel objectif</div>
        <label style={s.label}>Date de la course</label>
        <input style={s.input} type="date" value={obj.date} onChange={(e) => { setObj({ ...obj, date: e.target.value }); setShowSugg(false); }} />
        {showSugg && (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 2, marginTop: -6, marginBottom: 10, maxHeight: 150, overflowY: "auto", background: "#fff" }}>
            <div style={{ fontSize: 10, color: "#aaa", padding: "6px 8px 2px", textTransform: "uppercase", letterSpacing: 1 }}>Dates suggérées</div>
            {FUTURE_DATES.map((fd) => <div key={fd.iso} style={s.dateSuggestion} onClick={() => { setObj({ ...obj, date: fd.iso }); setShowSugg(false); }} onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"} onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>{fd.label}</div>)}
          </div>
        )}
        <label style={s.label}>Distance</label>
        <select style={s.select} value={obj.distance} onChange={(e) => setObj({ ...obj, distance: e.target.value })}>
          <option value="">— Choisir —</option>
          {OBJECTIVE_DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label style={s.label}>Type d'objectif <InfoTooltip text={`Prioritaire — vos courses phares, celles où vous visez votre meilleure forme. Elles orientent la structure de votre plan.\n\nSecondaire — des courses où vous voulez performer, sans qu'elles dictent votre préparation.\n\nAnnexe — des courses de préparation, abordées comme des entraînements en conditions réelles.\n\nRecommandé : 2-3 prioritaires/an, 3-6 secondaires, et autant d'annexes que souhaité.`} /></label>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {OBJ_TYPES.map((t) => <button key={t} style={genderBtn(obj.type === t)} onClick={() => setObj({ ...obj, type: t })}>{t}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={s.btn} onClick={onClose}>Annuler</button>
          <button style={{ ...s.btnPrimary, opacity: obj.date && obj.distance && obj.type ? 1 : 0.4 }} onClick={() => { if (obj.date && obj.distance && obj.type) onAdd(obj); }}>Ajouter</button>
        </div>
      </div>
    </div>
  );
}

function ObjectivesStep({ objectives, onAdd, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const fmt = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); };
  return (
    <div>
      <div style={s.sectionTitle}>Objectifs</div>
      {objectives.length === 0 && <div style={{ color: "#aaa", fontSize: 13, marginBottom: 12 }}>Aucun objectif défini.</div>}
      {objectives.map((obj, i) => (
        <div key={i} style={s.objectiveRow}>
          <div><span style={s.tag(obj.type)}>{obj.type}</span><span style={{ marginLeft: 8, fontWeight: 600 }}>{obj.distance}</span><span style={{ marginLeft: 8, color: "#888", fontSize: 12 }}>{fmt(obj.date)}</span></div>
          <button style={s.deleteBtn} onClick={() => onDelete(i)}>✕</button>
        </div>
      ))}
      <button style={{ ...s.btn, marginTop: 12 }} onClick={() => setShowModal(true)}>+ Ajouter un objectif</button>
      {showModal && <ObjectiveModal onClose={() => setShowModal(false)} onAdd={(o) => { onAdd(o); setShowModal(false); }} />}
    </div>
  );
}

export default ObjectivesStep;
