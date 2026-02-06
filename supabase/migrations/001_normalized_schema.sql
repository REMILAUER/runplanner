-- ============================================================
-- V3 — Normalisation DB RunPlanner
-- 7 tables : profiles, plans, objectives, cycles, weeks, sessions, session_steps
-- ============================================================

-- Helper : trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name      TEXT,
  gender          TEXT,
  birth_date      DATE,
  ref_distance    TEXT,
  ref_time        TEXT,
  year_km         NUMERIC(8,1),
  avg_week_km     NUMERIC(6,1),
  last_week_km    NUMERIC(6,1),
  sessions_per_week INTEGER DEFAULT 4,
  training_days   TEXT[] DEFAULT '{"Mar","Jeu","Sam"}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT profiles_user_id_unique UNIQUE (user_id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 2. PLANS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  start_date  DATE,
  paces       JSONB,
  warnings    TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plans"
  ON public.plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_plans_user_id ON public.plans(user_id);

CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 3. OBJECTIVES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.objectives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  distance    TEXT NOT NULL,
  type        TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own objectives"
  ON public.objectives FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = objectives.plan_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = objectives.plan_id AND p.user_id = auth.uid())
  );

CREATE INDEX idx_objectives_plan_id ON public.objectives(plan_id);

-- ──────────────────────────────────────────────────────────────
-- 4. CYCLES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cycles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  objective_id    UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('full_cycle', 'continuous')),
  start_date      DATE,
  total_weeks     INTEGER,
  phases          JSONB,
  volume_schedule JSONB,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cycles"
  ON public.cycles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = cycles.plan_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = cycles.plan_id AND p.user_id = auth.uid())
  );

CREATE INDEX idx_cycles_plan_id ON public.cycles(plan_id);

-- ──────────────────────────────────────────────────────────────
-- 5. WEEKS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weeks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  week_number     INTEGER NOT NULL,
  phase           TEXT NOT NULL,
  target_volume   NUMERIC(6,1),
  start_date      DATE,
  is_assimilation BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own weeks"
  ON public.weeks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.cycles c
      JOIN public.plans p ON p.id = c.plan_id
      WHERE c.id = weeks.cycle_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cycles c
      JOIN public.plans p ON p.id = c.plan_id
      WHERE c.id = weeks.cycle_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX idx_weeks_cycle_id ON public.weeks(cycle_id);

-- ──────────────────────────────────────────────────────────────
-- 6. SESSIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id              UUID NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  day_name             TEXT,
  date                 DATE,
  sort_order           INTEGER DEFAULT 0,
  type                 TEXT,
  title                TEXT,
  source_template_id   TEXT,
  is_custom            BOOLEAN DEFAULT false,
  target_duration_min  NUMERIC(6,1),
  target_distance_km   NUMERIC(6,1),
  description          TEXT,
  notes                TEXT,
  coach_tips           TEXT[],
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions"
  ON public.sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.weeks w
      JOIN public.cycles c ON c.id = w.cycle_id
      JOIN public.plans p ON p.id = c.plan_id
      WHERE w.id = sessions.week_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weeks w
      JOIN public.cycles c ON c.id = w.cycle_id
      JOIN public.plans p ON p.id = c.plan_id
      WHERE w.id = sessions.week_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX idx_sessions_week_id ON public.sessions(week_id);
CREATE INDEX idx_sessions_date ON public.sessions(date);

CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 7. SESSION_STEPS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_steps (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  sort_order                INTEGER NOT NULL,
  step_type                 TEXT NOT NULL,
  duration_sec              INTEGER,
  distance_m                INTEGER,
  pace_zone                 TEXT,
  pace_min_sec_km           INTEGER,
  pace_max_sec_km           INTEGER,
  reps                      INTEGER,
  recovery_duration_sec     INTEGER,
  recovery_type             TEXT,
  parent_step_id            UUID REFERENCES public.session_steps(id) ON DELETE CASCADE,
  sets                      INTEGER,
  recovery_between_sets_sec INTEGER,
  label                     TEXT,
  description               TEXT
);

ALTER TABLE public.session_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own session_steps"
  ON public.session_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.weeks w ON w.id = s.week_id
      JOIN public.cycles c ON c.id = w.cycle_id
      JOIN public.plans p ON p.id = c.plan_id
      WHERE s.id = session_steps.session_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.weeks w ON w.id = s.week_id
      JOIN public.cycles c ON c.id = w.cycle_id
      JOIN public.plans p ON p.id = c.plan_id
      WHERE s.id = session_steps.session_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX idx_session_steps_session_id ON public.session_steps(session_id);
