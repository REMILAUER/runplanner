import { useState, useRef, useEffect, useMemo } from "react";
import { DISTANCE_METERS } from './data/constants';
import { s } from './styles/styles';
import { FONT } from './styles/tokens';
import { parseTimeToSeconds, computeVDOT, computeAllPaces } from './engine/vdot';
import { buildPlan } from './engine/planBuilder';
import { buildCoachContext } from './engine/coachContext';
import { storage } from './services/storage';
import { useAuth } from './context/AuthContext';
import AuthScreen from './screens/AuthScreen';
import ProfileStep from './components/onboarding/ProfileStep';
import HistoryStep from './components/onboarding/HistoryStep';
import AvailabilityStep from './components/onboarding/AvailabilityStep';
import ObjectivesStep from './components/onboarding/ObjectivesStep';
import Summary from './components/onboarding/Summary';
import PaceScreen from './screens/PaceScreen';
import StructureScreen from './screens/StructureScreen';
import PlanScreen from './screens/PlanScreen';
import ChatButton from './components/chat/ChatButton';
import ChatPanel from './components/chat/ChatPanel';

const ONBOARDING_STEPS = ["Profil", "Historique", "Disponibilité", "Objectifs", "Résumé"];
const PLAN_STEPS = ["Allures", "Plan"];

const DEFAULT_PROFILE = { firstName: "", lastName: "", birthDate: "", gender: "", refDistance: "", refTime: "" };
const DEFAULT_HISTORY = { yearKm: "", avgWeekKm: "", lastWeekKm: "" };
const DEFAULT_AVAILABILITY = { sessionsPerWeek: 4, trainingDays: ["Mar", "Jeu", "Sam"] };

export default function App() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const userId = user?.id || null;
  const supabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL;

  // Phase 1: Synchronous init from localStorage (no flash)
  const localData = useRef(storage.loadLocal()).current;

  const [phase, setPhase] = useState(localData?.phase || "onboarding");
  const [step, setStep] = useState(localData?.step || 0);
  const [planStep, setPlanStep] = useState(localData?.planStep || 0);

  const [profile, setProfile] = useState(localData?.profile || DEFAULT_PROFILE);
  const [history, setHistory] = useState(localData?.history || DEFAULT_HISTORY);
  const [availability, setAvailability] = useState(localData?.availability || DEFAULT_AVAILABILITY);
  const [objectives, setObjectives] = useState(localData?.objectives || []);
  const [paces, setPaces] = useState(localData?.paces || null);
  const [plan, setPlan] = useState(localData?.plan || null);
  const [dataLoading, setDataLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Memoize coach context for the AI chat
  const coachContext = useMemo(() => {
    if (!plan) return "";
    return buildCoachContext({ profile, history, availability, objectives, paces, plan });
  }, [profile, history, availability, objectives, paces, plan]);

  // Phase 2: Async load from Supabase when user is available
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setDataLoading(true);

    storage.loadRemote(userId).then((remote) => {
      if (cancelled) return;
      if (remote && Object.keys(remote).length > 0) {
        if (remote.phase) setPhase(remote.phase);
        if (remote.step !== undefined) setStep(remote.step);
        if (remote.planStep !== undefined) setPlanStep(remote.planStep);
        if (remote.profile) setProfile(remote.profile);
        if (remote.history) setHistory(remote.history);
        if (remote.availability) setAvailability(remote.availability);
        if (remote.objectives) setObjectives(remote.objectives);
        if (remote.paces !== undefined) setPaces(remote.paces);
        if (remote.plan !== undefined) setPlan(remote.plan);
        storage.saveLocal(remote);
      }
      setDataLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId]);

  // Persist state on every change (localStorage immediate + Supabase debounced)
  useEffect(() => {
    storage.save({ phase, step, planStep, profile, history, availability, objectives, paces, plan }, userId);
  }, [phase, step, planStep, profile, history, availability, objectives, paces, plan, userId]);

  // ── Auth gate ──
  if (supabaseConfigured && authLoading) {
    return (
      <div style={s.app}>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
        <div style={{ marginTop: 60, textAlign: 'center' }}>
          <div style={s.title}>RunPlanner</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 8, fontFamily: FONT }}>Chargement...</div>
        </div>
      </div>
    );
  }

  if (supabaseConfigured && !user) {
    return <AuthScreen />;
  }

  if (dataLoading) {
    return (
      <div style={s.app}>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
        <div style={{ marginTop: 60, textAlign: 'center' }}>
          <div style={s.title}>RunPlanner</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 8, fontFamily: FONT }}>Chargement de vos données...</div>
        </div>
      </div>
    );
  }

  // ── Handlers ──
  const initPaces = () => {
    if (profile.refDistance && profile.refTime) {
      const vdot = computeVDOT(DISTANCE_METERS[profile.refDistance] || 10000, parseTimeToSeconds(profile.refTime || "40:00"));
      return computeAllPaces(vdot);
    }
    return computeAllPaces(45);
  };

  const handleValidate = () => {
    setPaces(initPaces());
    const today = new Date();
    const dayOfWeek = today.getDay();
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
    setStep(4);
  };

  const handleSignOut = async () => {
    await signOut();
    setPhase("onboarding");
    setStep(0);
    setPlanStep(0);
    setProfile(DEFAULT_PROFILE);
    setHistory(DEFAULT_HISTORY);
    setAvailability(DEFAULT_AVAILABILITY);
    setObjectives([]);
    setPaces(null);
    setPlan(null);
    storage.clearLocal();
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={s.title}>Onboarding Coureur</div>
          {user && (
            <button style={{ ...s.editBtn, color: '#c00', borderColor: '#c00' }} onClick={handleSignOut}>
              Déconnexion
            </button>
          )}
        </div>
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
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={s.editBtn} onClick={handleBackToSettings}>Paramètres</button>
          {user && (
            <button style={{ ...s.editBtn, color: '#c00', borderColor: '#c00' }} onClick={handleSignOut}>
              Déconnexion
            </button>
          )}
        </div>
      </div>
      <div style={s.subtitle}>Personnalisé à partir de vos données</div>
      {renderPlanStep()}
      {/* AI Coach Chat — only when Supabase is configured + user logged in + plan exists */}
      {supabaseConfigured && user && plan && (
        <>
          {!chatOpen && <ChatButton onClick={() => setChatOpen(true)} />}
          <ChatPanel
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            coachContext={coachContext}
            accessToken={session?.access_token}
          />
        </>
      )}
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
