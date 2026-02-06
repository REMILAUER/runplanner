import { s } from '../../styles/styles';

function Summary({ profile, history, availability, objectives, onEdit }) {
  const fmt = (d) => { if (!d) return "—"; const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); };
  return (
    <div>
      <div style={s.sectionTitle}>Récapitulatif</div>
      <div style={s.summarySection}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Profil</span><button style={s.editBtn} onClick={() => onEdit(0)}>Éditer ✎</button></div>
        <div style={s.summaryDetail}>{profile.firstName || "—"} {profile.lastName || "—"}{profile.gender ? ` · ${profile.gender}` : ""}{profile.birthDate ? ` · Né(e) le ${fmt(profile.birthDate)}` : ""}</div>
        {profile.refDistance && <div style={s.summaryDetail}>Référence : {profile.refDistance} en {profile.refTime}</div>}
      </div>
      <div style={s.summarySection}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Historique</span><button style={s.editBtn} onClick={() => onEdit(1)}>Éditer ✎</button></div>
        <div style={s.summaryDetail}>{history.yearKm || "—"} km/an · {history.avgWeekKm || "—"} km/sem (moy.) · {history.lastWeekKm || "—"} km dernière sem.</div>
      </div>
      <div style={s.summarySection}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Disponibilité</span><button style={s.editBtn} onClick={() => onEdit(2)}>Éditer ✎</button></div>
        <div style={s.summaryDetail}>{availability.sessionsPerWeek} séances/sem.{availability.sessionsPerWeek > 7 ? ` (dont biquotidien ${availability.sessionsPerWeek - 7}×)` : ""} · {availability.trainingDays.join(", ") || "—"}</div>
      </div>
      <div style={{ ...s.summarySection, borderBottom: "none" }}>
        <div style={s.summarySectionHeader}><span style={s.summarySectionTitle}>Objectifs ({objectives.length})</span><button style={s.editBtn} onClick={() => onEdit(3)}>Éditer ✎</button></div>
        {objectives.length === 0 && <div style={s.summaryDetail}>Aucun objectif défini.</div>}
        {objectives.map((obj, i) => <div key={i} style={{ ...s.summaryDetail, marginBottom: 4 }}><span style={s.tag(obj.type)}>{obj.type}</span> <span style={{ fontWeight: 600 }}>{obj.distance}</span> — {fmt(obj.date)}</div>)}
      </div>
      <div style={{ marginTop: 20, padding: 12, border: "2px solid #1a1a1a", borderRadius: 2, background: "#f8f8f0", fontSize: 12, color: "#555" }}>✓ Profil complet. Prêt à générer le plan d'entraînement.</div>
    </div>
  );
}

export default Summary;
