# Roadmap V3 — Normalisation DB + Contrôle utilisateur

## Contexte
- V2 (✅ terminée) : Auth Magic Link + persistance JSONB blob sur Supabase
- V3 : Normaliser la DB pour permettre le contrôle utilisateur sur les séances

## Architecture DB cible

```
profiles                          1 user = 1 profil
  ├── id (uuid, PK)
  ├── user_id (FK → auth.users)
  ├── first_name, last_name
  ├── birth_date, gender
  ├── ref_distance, ref_time
  ├── year_km, avg_week_km, last_week_km
  ├── sessions_per_week (int)
  ├── training_days (text[])
  └── created_at, updated_at

plans                             1 user = N plans
  ├── id (uuid, PK)
  ├── user_id (FK → auth.users)
  ├── name ("Prépa Marathon Paris 2026")
  ├── status (active / archived)
  ├── start_date
  ├── paces (JSONB)
  ├── warnings (text[])
  └── created_at, updated_at

objectives                        1 plan = N objectifs
  ├── id (uuid, PK)
  ├── plan_id (FK → plans)
  ├── date, distance, type
  └── sort_order (int)

cycles                            1 plan = N cycles
  ├── id (uuid, PK)
  ├── plan_id (FK → plans)
  ├── objective_id (FK → objectives, nullable)
  ├── type ("full_cycle" / "continuous")
  ├── start_date, total_weeks
  ├── phases (JSONB)
  └── volume_schedule (JSONB)

weeks                             1 cycle = N semaines
  ├── id (uuid, PK)
  ├── cycle_id (FK → cycles)
  ├── week_number, phase
  ├── target_volume, start_date
  ├── is_assimilation (bool)
  └── notes (text)

sessions                          1 week = N séances
  ├── id (uuid, PK)
  ├── week_id (FK → weeks)
  ├── day_name, date, sort_order
  ├── type, title, source_template_id
  ├── is_custom (bool)
  ├── target_duration_min
  ├── target_distance_km (JSONB)
  ├── description, notes, coach_tips
  ├── actual_duration_min, actual_distance_km (nullable, Strava)
  ├── completed (bool)
  └── updated_at

session_steps                     1 session = N steps ordonnés
  ├── id (uuid, PK)
  ├── session_id (FK → sessions)
  ├── sort_order
  ├── step_type (warmup / work / recovery / cooldown / repeat_group)
  ├── duration_sec, distance_m
  ├── pace_zone, pace_min_sec_km, pace_max_sec_km
  ├── intensity_pct (JSONB)
  ├── reps, recovery_duration_sec, recovery_type
  ├── parent_step_id (FK self, nullable), sets, recovery_between_sets_sec
  ├── label, description
```

## Estimation
~10-12h de dev (2-3 sessions de travail)

## Étapes
1. Créer les tables SQL
2. Script migration JSONB → tables normalisées
3. Réécrire storage.js (queries granulaires)
4. Adapter App.jsx + screens
5. Adapter weekGenerator.js pour écrire dans session_steps
6. Adapter pdfExport.js
7. Tests + debug
