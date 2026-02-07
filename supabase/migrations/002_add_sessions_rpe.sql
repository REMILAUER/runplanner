-- Add RPE column to sessions table
-- Stores the session's perceived exertion rating (1-10)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS rpe SMALLINT;
