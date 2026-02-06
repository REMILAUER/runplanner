import { s, genderBtn } from '../../styles/styles';
import { DEFAULT_TIMES, ALL_DISTANCES } from '../../data/constants';

function ProfileStep({ data, onChange }) {
  const handleDist = (e) => { const d = e.target.value; onChange({ ...data, refDistance: d, refTime: DEFAULT_TIMES[d] || "" }); };
  return (
    <div>
      <div style={s.sectionTitle}>Profil</div>
      <div style={s.row}>
        <div style={s.half}>
          <label style={s.label}>Prénom</label>
          <input style={s.input} value={data.firstName} onChange={(e) => onChange({ ...data, firstName: e.target.value })} placeholder="ex: Rémi" />
        </div>
        <div style={s.half}>
          <label style={s.label}>Nom</label>
          <input style={s.input} value={data.lastName} onChange={(e) => onChange({ ...data, lastName: e.target.value })} placeholder="ex: Dupont" />
        </div>
      </div>
      <label style={s.label}>Date de naissance</label>
      <input style={s.input} type="date" value={data.birthDate} onChange={(e) => onChange({ ...data, birthDate: e.target.value })} />
      <label style={s.label}>Genre</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["Homme", "Femme", "Autre"].map((g) => <button key={g} style={genderBtn(data.gender === g)} onClick={() => onChange({ ...data, gender: g })}>{g}</button>)}
      </div>
      <div style={s.sectionTitle}>Dernière course référence</div>
      <label style={s.label}>Distance</label>
      <select style={s.select} value={data.refDistance} onChange={handleDist}>
        <option value="">— Choisir —</option>
        {ALL_DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      {data.refDistance && (
        <>
          <label style={s.label}>Temps (suggestion : {DEFAULT_TIMES[data.refDistance]})</label>
          <input style={s.input} value={data.refTime} onChange={(e) => onChange({ ...data, refTime: e.target.value })} placeholder={DEFAULT_TIMES[data.refDistance]} />
        </>
      )}
    </div>
  );
}

export default ProfileStep;
