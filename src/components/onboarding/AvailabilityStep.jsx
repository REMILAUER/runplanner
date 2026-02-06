import { s, dayBtn } from '../../styles/styles';
import { DAYS_LIST } from '../../data/constants';

function AvailabilityStep({ data, onChange }) {
  const toggleDay = (day) => { const days = data.trainingDays.includes(day) ? data.trainingDays.filter((d) => d !== day) : [...data.trainingDays, day]; onChange({ ...data, trainingDays: days }); };
  return (
    <div>
      <div style={s.sectionTitle}>Disponibilité</div>
      <label style={s.label}>Nombre de séances par semaine</label>
      <div style={s.counter}>
        <button style={s.counterBtn} onClick={() => onChange({ ...data, sessionsPerWeek: Math.max(1, data.sessionsPerWeek - 1) })}>−</button>
        <span style={s.counterValue}>{data.sessionsPerWeek}</span>
        <button style={s.counterBtn} onClick={() => onChange({ ...data, sessionsPerWeek: Math.min(14, data.sessionsPerWeek + 1) })}>+</button>
        <span style={{ fontSize: 12, color: "#888" }}>séances/sem.</span>
      </div>
      {data.sessionsPerWeek > 7 && <div style={{ fontSize: 11, color: "#b08000", marginBottom: 8 }}>↳ {data.sessionsPerWeek} séances = biquotidien sur {data.sessionsPerWeek - 7} jour{data.sessionsPerWeek - 7 > 1 ? "s" : ""}</div>}
      <label style={s.label}>Jours d'entraînement</label>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {DAYS_LIST.map((day) => <button key={day} style={dayBtn(data.trainingDays.includes(day))} onClick={() => toggleDay(day)}>{day}</button>)}
      </div>
      <div style={{ fontSize: 11, color: "#888" }}>{data.trainingDays.length} jour{data.trainingDays.length > 1 ? "s" : ""} sélectionné{data.trainingDays.length > 1 ? "s" : ""}</div>
    </div>
  );
}

export default AvailabilityStep;
