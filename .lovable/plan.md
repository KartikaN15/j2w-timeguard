# J2W Attendance — Phase 1 Plan

The full spec spans web admin + React Native mobile + Node/FastAPI microservices + Redis + S3 + SafetyNet/DeviceCheck. Lovable builds **web apps on TanStack Start + Lovable Cloud (Postgres/Auth/Storage)** — native mobile, Python microservices, Redis, and platform attestation APIs are out of scope here. I'll deliver a production-grade **web** implementation of your "start with" slice, designed so a RN app can later hit the same backend.

## Scope of this iteration (matches your "Start with")
1. **Auth flow** — email + password via Lovable Cloud Auth. MFA (TOTP) stubbed as a follow-up toggle (Cloud Auth doesn't natively expose TOTP enrollment yet — I'll wire a `mfa_enabled` flag + UI placeholder and we can add real TOTP after).
2. **Device binding** — capture browser device fingerprint on first login, store in `user_devices`, enforce max 2 per employee, new devices go to `pending_devices` for HR approval.
3. **Punch-in/out engine** with:
   - Live geolocation permission check on every punch (no cache).
   - GPS accuracy gate (reject > 100m).
   - Haversine geofence check vs employee's configured office/home location.
   - Mock-location heuristic (best-effort in browser: accuracy=0, repeated identical fixes, permission anomalies).
   - Liveness selfie capture (webcam, single frame — true blink detection requires native ML; I'll capture + store and flag as "liveness: basic").
   - Append-only insert into `attendance_events`.
4. **Minimal HR screens**: pending device approvals, employee geofence config, live punch dashboard.
5. **Dark-blue + white UI**, "J2W" header.

## Out of scope this round (call out, build later)
- Leave management, anomaly dashboard, reports/exports, push notifications.
- React Native mobile app, SafetyNet/DeviceCheck attestation.
- Real TOTP/SMS MFA enrollment, biometric WebAuthn gate (can add WebAuthn next round as the web equivalent of fingerprint).
- IP-vs-GPS city cross-check (needs a paid IP geolocation API — wire after you pick a provider).
- AES-256-at-rest selfie encryption beyond Lovable Cloud Storage defaults + 90-day purge cron.
- Dual-approval correction workflow on attendance edits (table is already append-only so corrections will be "correction events" later).

## Data model (Lovable Cloud / Postgres)
- `profiles` (id=auth.uid, full_name, email, role)
- `user_roles` (user_id, role enum: super_admin | hr_admin | account_manager | reporting_manager | employee) — separate table, `has_role()` SECURITY DEFINER
- `employee_config` (user_id PK, office_lat, office_lng, office_radius_m default 150, home_lat, home_lng, home_radius_m default 200, weekly_schedule jsonb)
- `user_devices` (id, user_id, fingerprint, label, approved_at, approved_by, created_at) — max 2 approved per user enforced in app + trigger
- `pending_devices` (id, user_id, fingerprint, user_agent, requested_at)
- `attendance_events` (id, user_id, device_fingerprint, event_type: punch_in|punch_out, ts_utc, lat, lng, accuracy_m, geofence_status, ip_address, mock_flag, selfie_path, anomaly_flags jsonb) — **append-only**: GRANT only SELECT, INSERT to authenticated; no UPDATE/DELETE
- `audit_events` (id, actor_id, action, target, payload jsonb, ts) — append-only

RLS: employees see only their own rows; hr_admin/super_admin see all; account/reporting managers see their reports (kept simple this round = same as hr).

## Tech notes
- Fingerprint: `@fingerprintjs/fingerprintjs` (open-source build).
- Geolocation: `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy:true`, `maximumAge:0`, `timeout:30000`.
- Selfie: `getUserMedia` → canvas → blob → upload to Cloud Storage bucket `selfies` (private).
- Haversine done client-side for UX + re-validated server-side in a server function before insert (client cannot be trusted).
- All punch logic runs through a `submitPunch` server function with `requireSupabaseAuth` so the geofence/device checks are authoritative.

## UI
- Dark navy (`oklch` token) primary, white surfaces, "J2W" wordmark header, sidebar nav.
- Routes: `/auth`, `/` (employee punch home), `/history`, `/admin/devices`, `/admin/employees`, `/admin/live`.

## Deliverable
A working web app you can sign up to, register a device, configure your geofence (as admin), and punch in/out with real geolocation + selfie + append-only event log. Everything else from the spec layered on after.

Confirm and I'll build, or tell me to drop/add anything from this slice.