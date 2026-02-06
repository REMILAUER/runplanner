import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { DISTANCE_METERS } from './data/constants';
import { s } from './styles/styles';
import { FONT, colors } from './styles/tokens';
import { parseTimeToSeconds, computeVDOT, computeAllPaces } from './engine/vdot';
import { buildPlan } from './engine/planBuilder';
import { generateAndPersistPlan } from './engine/weekGenerator';
import { hydrateWeeksFromDb } from './engine/weekHydrator';
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
import PlanScreen from './screens/PlanScreen';
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
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [activePlanId, setActivePlanId] = useState(localData?.activePlanId || null);
  const [dataLoading, setDataLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Memoize coach context for the AI chat
  const coachContext = useMemo(() => {
    if (!plan) return "";
    return buildCoachContext({ profile, history, availability, objectives, paces, plan });
  }, [profile, history, availability, objectives, paces, plan]);

  // Phase 2: Async load from Supabase — try normalized tables first, then legacy blob
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setDataLoading(true);

    async function loadData() {
      // Try normalized tables first
      const profileData = await storage.loadProfile(userId);

      if (profileData) {
        // ── Normalized data exists ──
        if (cancelled) return;
        setProfile({
          firstName: profileData.firstName,
          lastName: '',
          birthDate: profileData.birthDate,
          gender: profileData.gender,
          refDistance: profileData.refDistance,
          refTime: profileData.refTime,
        });
        setHistory({
          yearKm: profileData.yearKm,
          avgWeekKm: profileData.avgWeekKm,
          lastWeekKm: profileData.lastWeekKm,
        });
        setAvailability({
          sessionsPerWeek: profileData.sessionsPerWeek,
          trainingDays: profileData.trainingDays,
        });

        const planData = await storage.loadActivePlan(userId);
        if (cancelled) return;

        if (planData) {
          setActivePlanId(planData.id);
          setPaces(planData.paces);
          setObjectives((planData.objectives || []).map(o => ({
            date: o.date,
            distance: o.distance,
            type: o.type,
          })));

          // Reconstruct plan object from cycles
          const cycles = (planData.cycles || []).map(c => ({
            objective: null, // not needed for display
            phases: c.phases,
            volumeSchedule: c.volume_schedule,
            startDate: c.start_date,
            type: c.type,
          }));
          setPlan({ cycles, warnings: planData.warnings || [] });

          // Load weekly plan from DB (all cycles)
          if (planData.cycles && planData.cycles.length > 0) {
            const allDbWeeks = [];
            for (const cycle of planData.cycles) {
              const cycleWeeks = await storage.loadWeeksForCycle(cycle.id);
              if (cancelled) return;
              if (cycleWeeks) allDbWeeks.push(...cycleWeeks);
            }
            if (allDbWeeks.length > 0) {
              setWeeklyPlan(hydrateWeeksFromDb(allDbWeeks));
            }
          }

          setPhase('plan');
        }
      } else {
        // ── No normalized data — try legacy blob migration ──
        const remote = await storage.loadRemote(userId);
        if (cancelled) return;

        if (remote && Object.keys(remote).length > 0) {
          // Apply legacy data to state
          if (remote.phase) setPhase(remote.phase);
          if (remote.step !== undefined) setStep(remote.step);
          if (remote.planStep !== undefined) setPlanStep(remote.planStep);
          if (remote.profile) setProfile(remote.profile);
          if (remote.history) setHistory(remote.history);
          if (remote.availability) setAvailability(remote.availability);
          if (remote.objectives) setObjectives(remote.objectives);
          if (remote.paces !== undefined) setPaces(remote.paces);
          if (remote.plan !== undefined) setPlan(remote.plan);

          // Trigger migration in background
          const migrationResult = await storage.migrateFromBlob(userId, remote);
          if (cancelled) return;

          if (migrationResult?.planId) {
            setActivePlanId(migrationResult.planId);

            // Generate and persist weekly plan to DB
            if (remote.plan && remote.availability && remote.paces) {
              const startDate = remote.plan.cycles?.[0]?.startDate
                ? new Date(remote.plan.cycles[0].startDate)
                : new Date();
              const { weeklyPlan: wp, dbWeeks } = generateAndPersistPlan(
                remote.plan, remote.availability, remote.paces, startDate
              );
              setWeeklyPlan(wp);

              // Persist weeks/sessions/steps to DB
              if (migrationResult.cycleIds?.[0]) {
                await storage.saveGeneratedPlan(migrationResult.cycleIds[0], dbWeeks);
              }
            }
          }
        }
      }

      if (!cancelled) setDataLoading(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, [userId]);

  // Persist to localStorage on every state change (lightweight — no weeklyPlan)
  useEffect(() => {
    storage.saveLocal({
      phase, step, planStep, profile, history, availability,
      objectives, paces, plan, activePlanId,
    });
  }, [phase, step, planStep, profile, history, availability, objectives, paces, plan, activePlanId]);

  // Persist paces to normalized DB when they change
  const pacesInitialized = useRef(false);
  useEffect(() => {
    if (!pacesInitialized.current) { pacesInitialized.current = true; return; }
    if (supabaseConfigured && userId && activePlanId && paces) {
      storage.updatePlan(activePlanId, { paces })
        .catch(() => { setSaveError(true); setTimeout(() => setSaveError(false), 4000); });
    }
  }, [paces, activePlanId, userId, supabaseConfigured]);

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

  const handleValidate = async () => {
    const newPaces = initPaces();
    setPaces(newPaces);

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

    // Generate weekly plan + DB-ready data
    const { weeklyPlan: wp, dbWeeks } = generateAndPersistPlan(
      builtPlan, availability, newPaces, startDate
    );
    setWeeklyPlan(wp);
    setPhase("plan");
    setPlanStep(0);

    // Persist to normalized DB (async, non-blocking for UI)
    if (supabaseConfigured && userId) {
      try {
        // Save profile (merged)
        await storage.saveProfile(userId, {
          firstName: profile.firstName,
          gender: profile.gender,
          birthDate: profile.birthDate,
          refDistance: profile.refDistance,
          refTime: profile.refTime,
          yearKm: history.yearKm,
          avgWeekKm: history.avgWeekKm,
          lastWeekKm: history.lastWeekKm,
          sessionsPerWeek: availability.sessionsPerWeek,
          trainingDays: availability.trainingDays,
        });

        // Create plan
        const objName = objectives[0]
          ? `Prépa ${objectives[0].distance} ${objectives[0].date}`
          : 'Mon plan';
        const planId = await storage.createPlan(userId, {
          name: objName,
          startDate: startDate.toISOString().split('T')[0],
          paces: newPaces,
          warnings: builtPlan.warnings || [],
        });

        if (planId) {
          setActivePlanId(planId);

          // Save objectives
          const insertedObjectives = await storage.saveObjectives(planId, objectives);

          // Save cycles
          const objectiveIds = builtPlan.cycles.map((cycle, i) => {
            if (!cycle.objective) return null;
            return insertedObjectives?.[i]?.id || null;
          });
          const cycleIds = await storage.saveCycles(planId, builtPlan.cycles, objectiveIds);

          // Save weeks + sessions + steps
          if (cycleIds[0] && dbWeeks.length > 0) {
            await storage.saveGeneratedPlan(cycleIds[0], dbWeeks);
          }
        }
      } catch (err) {
        console.warn('[App] DB persist error (non-blocking):', err.message);
        setSaveError(true);
        setTimeout(() => setSaveError(false), 4000);
      }
    }
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
    setWeeklyPlan(null);
    setActivePlanId(null);
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
        return <PlanScreen plan={plan} paces={paces} profile={profile} availability={availability} weeklyPlan={weeklyPlan} />;
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
        <ChatPanel
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          coachContext={coachContext}
          accessToken={session?.access_token}
        />
      )}
      {/* Save error indicator */}
      {saveError && (
        <div style={{
          position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 14px', borderRadius: 2, fontSize: 11, fontFamily: FONT, zIndex: 100,
          background: '#c00', color: '#fff',
        }}>
          Erreur de sauvegarde
        </div>
      )}
      <div style={s.nav}>
        <button style={s.btn} onClick={handleBackToSettings}>Paramètres</button>
        <div style={{ display: "flex", gap: 4 }}>
          {supabaseConfigured && user && plan && (
            <button
              style={{ ...s.btnPrimary, background: colors.primary, borderColor: colors.primary }}
              onClick={() => setChatOpen(true)}
            >
              Des questions ?
            </button>
          )}
          {planStep < totalPlanSteps - 1 ? (
            <button style={s.btnPrimary} onClick={() => setPlanStep(planStep + 1)}>Suivant →</button>
          ) : (
            <button style={{ ...s.btnPrimary, background: "#2a6e2a", borderColor: "#2a6e2a" }} onClick={() => {
              document.querySelector('[data-export-pdf]')?.click();
            }}>Export PDF</button>
          )}
        </div>
      </div>
    </div>
  );
}
