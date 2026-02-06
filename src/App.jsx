import { useState, useRef, useEffect } from "react";
import { DISTANCE_METERS } from './data/constants';
import { s } from './styles/styles';
import { parseTimeToSeconds, computeVDOT, computeAllPaces } from './engine/vdot';
import { buildPlan } from './engine/planBuilder';
import { storage } from './services/storage';
import ProfileStep from './components/onboarding/ProfileStep';
import HistoryStep from './components/onboarding/HistoryStep';
import AvailabilityStep from './components/onboarding/AvailabilityStep';
import ObjectivesStep from './components/onboarding/ObjectivesStep';
import Summary from './components/onboarding/Summary';
import PaceScreen from './screens/PaceScreen';
import StructureScreen from './screens/StructureScreen';
import PlanScreen from './screens/PlanScreen';

const ONBOARDING_STEPS = ["Profil", "Historique", "Disponibilité", "Objectifs", "Résumé"];
const PLAN_STEPS = ["Allures", "Plan"];

export default function App() {
  const saved = useRef(storage.load()).current;

  const [phase, setPhase] = useState(saved?.phase || "onboarding");
  const [step, setStep] = useState(saved?.step || 0);
  const [planStep, setPlanStep] = useState(saved?.planStep || 0);

  const [profile, setProfile] = useState(saved?.profile || { firstName: "", lastName: "", birthDate: "", gender: "", refDistance: "", refTime: "" });
  const [history, setHistory] = useState(saved?.history || { yearKm: "", avgWeekKm: "", lastWeekKm: "" });
  const [availability, setAvailability] = useState(saved?.availability || { sessionsPerWeek: 4, trainingDays: ["Mar", "Jeu", "Sam"] });
  const [objectives, setObjectives] = useState(saved?.objectives || []);
  const [paces, setPaces] = useState(saved?.paces || null);
  const [plan, setPlan] = useState(saved?.plan || null);

  // Persist state to localStorage on every change
  useEffect(() => {
    storage.save({ phase, step, planStep, profile, history, availability, objectives, paces, plan });
  }, [phase, step, planStep, profile, history, availability, objectives, paces, plan]);

  const initPaces = () => {
    if (profile.refDistance && profile.refTime) {
      const vdot = computeVDOT(DISTANCE_METERS[profile.refDistance] || 10000, parseTimeToSeconds(profile.refTime || "40:00"));
      return computeAllPaces(vdot);
    }
    return computeAllPaces(45);
  };

  const handleValidate = () => {
    setPaces(initPaces());

    // Build periodization plan — start on next Monday
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + daysUntilMonday);
    startDate.setHours(0, 0, 0, 0);
    const onboarding = {
      yearKm: history.yearKm,
      avg4wKm: history.avgWeekKm,
      lastWeekKm: history.lastWeekKm,
    };
    const builtPlan = buildPlan(startDate, objectives, onboarding);
    setPlan(builtPlan);

    setPhase("plan");
    setPlanStep(0);
  };

  const handleBackToSettings = () => {
    setPhase("onboarding");
    setStep(4); // Go to Résumé step so user can review & edit
  };

  // ── Onboarding phase ──
  if (phase === "onboarding") {
    const totalSteps = ONBOARDING_STEPS.length;
    const progress = ((step + 1) / totalSteps) * 100;

    const renderStep = () => {
      switch (step) {
        case 0: return <ProfileStep data={profile} onChange={setProfile} />;
        case 1: return <HistoryStep data={history} onChange={setHistory} />;
        case 2: return <AvailabilityStep data={availability} onChange={setAvailability} />;
        case 3: return <ObjectivesStep objectives={objectives} onAdd={(o) => setObjectives([...objectives, o])} onDelete={(i) => setObjectives(objectives.filter((_, idx) => idx !== i))} />;
        case 4: return <Summary profile={profile} history={history} availability={availability} objectives={objectives} onEdit={(t) => setStep(t)} />;
        default: return null;
      }
    };

    return (
      <div style={s.app}>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
        <div style={{ ...s.progressBar, width: `${progress}%` }} />
        <div style={s.stepIndicator}>Étape {step + 1}/{totalSteps} — {ONBOARDING_STEPS[step]}</div>
        <div style={s.title}>Onboarding Coureur</div>
        <div style={s.subtitle}>Configuration du profil d'entraînement</div>
        {renderStep()}
        <div style={s.nav}>
          <button style={{ ...s.btn, visibility: step > 0 ? "visible" : "hidden" }} onClick={() => setStep(step - 1)}>← Retour</button>
          <span style={{ fontSize: 11, color: "#aaa" }}>{ONBOARDING_STEPS[step]}</span>
          {step < totalSteps - 1 ? (
            <button style={s.btnPrimary} onClick={() => setStep(step + 1)}>Suivant →</button>
          ) : (
            <button style={{ ...s.btnPrimary, background: "#2a6e2a", borderColor: "#2a6e2a" }} onClick={handleValidate}>Valider ✓</button>
          )}
        </div>
      </div>
    );
  }

  // ── Plan phase ──
  const totalPlanSteps = PLAN_STEPS.length;
  const planProgress = ((planStep + 1) / totalPlanSteps) * 100;

  const renderPlanStep = () => {
    switch (planStep) {
      case 0:
        return <PaceScreen profile={profile} paces={paces} onPacesChange={setPaces} />;
      case 1:
        return <PlanScreen plan={plan} paces={paces} profile={profile} availability={availability} />;
      default:
        return null;
    }
  };

  return (
    <div style={s.app}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={{ ...s.progressBar, width: `${planProgress}%` }} />
      <div style={s.stepIndicator}>Votre plan — {planStep + 1}/{totalPlanSteps} — {PLAN_STEPS[planStep]}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={s.title}>{profile.firstName ? `${profile.firstName}, votre plan` : "Votre plan"}</div>
        <button style={s.editBtn} onClick={handleBackToSettings}>Paramètres</button>
      </div>
      <div style={s.subtitle}>Personnalisé à partir de vos données</div>
      {renderPlanStep()}
      <div style={s.nav}>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button style={s.btn} onClick={handleBackToSettings}>Paramètres</button>
          {planStep > 0 && <button style={s.btn} onClick={() => setPlanStep(planStep - 1)}>← Retour</button>}
        </div>
        {planStep < totalPlanSteps - 1 ? (
          <button style={s.btnPrimary} onClick={() => setPlanStep(planStep + 1)}>Suivant →</button>
        ) : (
          <button style={{ ...s.btnPrimary, background: "#2a6e2a", borderColor: "#2a6e2a" }} onClick={() => {
            document.querySelector('[data-export-pdf]')?.click();
          }}>Export PDF</button>
        )}
      </div>
    </div>
  );
}
