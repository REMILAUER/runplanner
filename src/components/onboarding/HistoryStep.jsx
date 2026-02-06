import { s } from '../../styles/styles';
import InfoTooltip from '../ui/InfoTooltip';

function HistoryStep({ data, onChange }) {
  return (
    <div>
      <div style={s.sectionTitle}>Historique</div>
      <label style={s.label}>Total km sur l'année précédente <InfoTooltip text="Nous avons besoin d'une estimation de votre volume annuel pour calibrer votre plan. Pas besoin d'être exact — une estimation raisonnable suffit." /></label>
      <input style={s.input} type="number" value={data.yearKm} onChange={(e) => onChange({ ...data, yearKm: e.target.value })} placeholder="ex: 1500" />
      <label style={s.label}>Km/semaine (moyenne 4 dernières semaines)</label>
      <input style={s.input} type="number" value={data.avgWeekKm} onChange={(e) => onChange({ ...data, avgWeekKm: e.target.value })} placeholder="ex: 45" />
      <label style={s.label}>Km sur la dernière semaine</label>
      <input style={s.input} type="number" value={data.lastWeekKm} onChange={(e) => onChange({ ...data, lastWeekKm: e.target.value })} placeholder="ex: 50" />
    </div>
  );
}

export default HistoryStep;
