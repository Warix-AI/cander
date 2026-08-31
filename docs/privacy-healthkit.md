# Apple Health / HealthKit privacy (P0)

## Scope

Cander may request **read-only** access to these HealthKit types when the user connects Apple Health and asks about **their own** data:

- Step count
- Workouts
- Active energy
- Resting heart rate
- Sleep analysis

## Rules

- **No writes.** No Clinical Records. No advertising or analytics of HealthKit values.
- Authorization success ≠ all read types granted (HealthKit hides per-type READ status).
- Empty results are reported as `succeeded_no_visible_data` — **never** as permission denied.
- Raw samples are aggregated natively and **discarded** after the answer; no parallel cloud health database in P0.
- Disconnect in Cander clears the local pref and stops exposing health tools; it does **not** revoke iOS Health permissions (user manages that in the Health app).
- Feature flag: `NEXT_PUBLIC_AI_HEALTHKIT` (default off).

## App Store

Before TestFlight: update privacy policy + App Privacy labels for HealthKit (Health & Fitness — HealthKit). Usage string: `NSHealthShareUsageDescription` only.
