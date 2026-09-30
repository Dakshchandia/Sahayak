# SAHAYAK — Personnel Welfare Support System

A full-stack welfare decision-support application for CAPFs, Armed Forces and other uniformed services.
Built for local development and SIH demonstration. **Synthetic data only. Not for real personnel records.**

---

## Quick start (without Docker)

Requirements: Node.js 20+, PostgreSQL 16+

```sh
# 1. Clone and install
npm install --legacy-peer-deps

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL and SESSION_SECRET at minimum

# 3. Run migrations
npm run db:push

# 4. Seed demo data
npm run db:seed

# 5. Start development server
npm run dev
```

Open http://localhost:3000 — you will be redirected to the login page.

---

## Quick start (Docker — recommended)

Requirements: Docker Desktop

```sh
docker compose up --build
```

This single command:
1. Starts PostgreSQL 16 and Mailhog (email capture)
2. Runs database migrations automatically
3. Seeds demo accounts and synthetic data
4. Starts the Next.js application at **http://localhost:3000**

Email UI (Mailhog): http://localhost:8025

---

## Demo credentials (local demonstration only)

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@sahayak.local | Admin@1234 |
| Welfare Officer | welfare.officer@sahayak.local | Demo@1234 |
| Commander | commander@sahayak.local | Demo@1234 |
| Personnel (Ravi Kumar, elevated) | ravi.kumar@sahayak.local | Demo@1234 |
| Any other personnel | firstname.lastname@sahayak.local | Demo@1234 |

All accounts are seeded with synthetic fictional data. First login does not enforce password change in demo mode.

---

## SIH demonstration walkthrough

1. **Login as Administrator** (admin@sahayak.local)
   - Go to Administration → create a unit, create a user, assign a role
   - Note: role changes are server-enforced and audit-logged

2. **Login as Welfare Officer** (welfare.officer@sahayak.local)
   - Overview: see unit metrics, elevated count, follow-ups
   - Welfare cases: search, filter by status, open Ravi Kumar's case
   - Case detail: review explainable factors, set status, add a note, set follow-up date
   - Import: upload a duty schedule CSV (use the downloadable template)
   - Follow-ups: see overdue/upcoming indicators

3. **Login as Personnel** (ravi.kumar@sahayak.local)
   - Dashboard: see check-in history and support status
   - Check-in: submit mood/sleep/fatigue/workload; request support
   - Support page: choose contact method, view request status
   - Privacy & access: toggle wellness consent, see data categories

4. **Login as Commander** (commander@sahayak.local)
   - Unit overview: see aggregate distribution bars (no individual data)
   - Scenario planner: move the sliders and click Compare — see estimated indicator change
   - Export: download the aggregate CSV
   - Observe that individual check-ins and counselling notes are absent from this view

5. **Consent withdrawal test** (as Ravi Kumar)
   - Privacy & access → disable "Wellness check-ins"
   - Confirm withdrawal warning
   - Observe that subsequent assessments exclude wellness factors

6. **Notifications**
   - Any support request or case update generates an in-app notification
   - Click the bell icon to view and mark as read
   - With Mailhog running, a generic email is also delivered (port 8025)

---

## Architecture overview

```
Browser
  │
  └── Next.js 15 App Router (app/)
        ├── Server Components (data fetching, auth guards)
        ├── Client Components ("use client" pages — preserved visual design)
        └── Route Handlers (app/api/**)
              │
              ├── lib/auth/       — session, password, CSRF, rate-limit
              ├── lib/domain.ts   — versioned rule engine
              ├── lib/audit.ts    — audit event recorder
              ├── lib/ai/         — Gemini adapter + template fallback
              ├── lib/notifications.ts — in-app + optional email
              └── db/             — Drizzle ORM → PostgreSQL 16
```

### Role flow
```
Login → /api/auth/login → bcrypt verify → session cookie (HttpOnly) → redirect by role
  Personnel    → /personnel/dashboard
  Welfare Off. → /welfare
  Commander    → /commander
  Admin        → /admin
```

### Assessment flow
```
check-in submitted
  → /api/personnel/checkin POST
  → consent check
  → INSERT check_ins
  → triggerAssessment()
      → load active rule_version
      → calculateAssessment() [lib/domain.ts]
      → getAiExplanation()   [lib/ai/provider.ts — Gemini or template]
      → INSERT assessments + assessment_factors
  → if requestedSupport: INSERT support_requests + notifications
```

---

## Data model summary

| Table | Purpose |
|-------|---------|
| units | Organizational units (Alpha, Bravo, Charlie…) |
| users | Accounts with server-assigned roles |
| sessions | DB-backed sessions (HttpOnly cookie) |
| login_attempts | Rate-limiting audit |
| personnel_profiles | Rank, service number, profile metadata |
| duty_records | Weekly hours, night shifts, consecutive days |
| deployment_records | Deployment periods and locations |
| leave_records | Leave history |
| transfer_records | Inter-unit transfers |
| training_records | Training commitments |
| import_jobs | CSV import audit with row counts |
| import_errors | Per-row validation errors |
| consent_records | Scope-level consent with withdrawal history |
| check_ins | Daily voluntary wellness responses |
| rule_versions | Versioned, configurable assessment rules |
| assessments | Scored assessments with explanation |
| assessment_factors | Per-factor breakdown for each assessment |
| support_requests | Confidential support requests |
| welfare_cases | Case workflow (state machine) |
| case_status_history | Full transition log |
| interventions | Recorded welfare actions |
| case_notes | Confidential welfare officer notes |
| alert_feedback | False-alert feedback from officers |
| appointments | Scheduled welfare meetings |
| notifications | In-app notification queue |
| audit_events | Action history log |
| record_correction_requests | Personnel data dispute requests |

---

## API reference (key endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | public | Login with email + password |
| POST | /api/auth/logout | session | Invalidate session |
| GET | /api/auth/me | session | Current user + CSRF token |
| GET | /api/health | public | DB health check |
| GET/POST | /api/personnel/checkin | personnel | Submit/view check-ins |
| GET/POST | /api/personnel/consent | personnel | Manage consent |
| GET/POST | /api/personnel/support | personnel | Support requests |
| GET/POST | /api/welfare/cases | welfare_officer | Case queue + state updates |
| GET/POST | /api/welfare/notes | welfare_officer | Confidential case notes |
| GET/POST | /api/welfare/interventions | welfare_officer | Intervention records |
| GET | /api/commander/aggregates | commander | Unit aggregates (no individual data) |
| POST | /api/commander/scenario | commander | Workload scenario calculation |
| POST | /api/import | welfare_officer | CSV import (preview + commit) |
| GET/POST | /api/notifications | session | In-app notifications |
| GET/POST | /api/admin/users | admin | User management |
| GET/POST | /api/admin/units | admin | Unit management |

All mutating routes require a valid CSRF token in the request body.

---

## Honest limitations

These limitations are factual, not aspirational:

1. **Audit is not tamper-proof.** Records live in a regular PostgreSQL table. Direct database access can modify or delete them. This is operational audit history, not a cryptographic ledger.

2. **Case notes are not encrypted at the field level.** Notes are stored as plaintext. Production requires application-level encryption with key management (e.g., AWS KMS, HashiCorp Vault).

3. **No live CAPF/HR integration.** Organizational data is imported via CSV. A real deployment requires authorized data connectors from verified HR systems.

4. **Rate limiting is in-process.** The token bucket lives in application memory. In multi-instance deployments, replace with a Redis adapter (same interface).

5. **ML model learns rules, not welfare.** The experimental pipeline trains on synthetic, rule-derived labels. High accuracy means good rule reproduction — it does not validate clinical effectiveness.

6. **AI explanations are optional.** With no `GEMINI_API_KEY`, template explanations are used. Template text is clearly labeled.

7. **No biometric integration.** The wearable consent UI is present but the integration is not implemented.

8. **Single-language UI.** English and Hindi translation structures are implemented via next-intl. Hindi translations cover all UI strings. Additional languages require professional translation review before use.

9. **Appointments have no conflict detection.** Scheduling creates a record; calendar conflict checking and reminders are not yet implemented.

10. **Email delivery is fire-and-forget.** Failed deliveries are logged but not retried automatically in this version.

---

## Running tests

```sh
npm test               # run all unit tests once
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
```

Tests cover: rule engine, password hashing, rate limiting, CSRF, CSV parsing, authorization invariants, AI fallback behavior. All 67 tests pass without a database connection.

Integration tests (requiring DATABASE_URL) are in `tests/integration/` and are skipped in CI unless the flag is set.

---

## Experimental ML pipeline

See `scripts/ml/README.md` for full details.

```sh
cd scripts/ml
pip install -r requirements.txt
python generate_synthetic_data.py
python train_model.py
```

⚠ Results describe rule reproduction, not clinical effectiveness.
