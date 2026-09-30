# SAHAYAK — Product Requirements Document (PRD)

**Version:** 2.0  
**Status:** Implemented & Running  
**Stack:** Next.js 15 · PostgreSQL / PGlite · TypeScript · Tailwind CSS  
**Live at:** http://localhost:3000

---

## 1. What is SAHAYAK?

SAHAYAK is a **welfare decision-support and workload management system** built for personnel serving in CAPFs (Central Armed Police Forces), Armed Forces, and other uniformed services.

It exists because:
- Personnel face extended deployments, irregular duty hours, family separation, and limited recovery opportunities.
- Organizational records (duty rosters, deployments, leave) and voluntary wellness information are **fragmented across systems**.
- Welfare officers need structured context to prioritize who needs a conversation.
- Commanders need operational workload data to plan sustainably.
- Personnel need a trusted, private channel to flag concerns without fear of discipline.

SAHAYAK connects these needs into one system with **clear privacy boundaries** between wellness data and operational data.

---

## 2. What the System Does — High Level

| Capability | Who uses it | What it does |
|---|---|---|
| Wellness check-ins | Personnel | Voluntary mood, sleep, fatigue submission |
| Welfare assessment | Auto + Welfare Officer | Rule-based indicator score with explainable factors |
| Welfare case management | Welfare Officer | Case queue, notes, interventions, follow-ups |
| Support requests | Personnel | Confidential request to speak with welfare officer |
| Organizational data import | Welfare Officer / Admin | CSV import of duty, deployment, leave, transfer, training |
| Duty ledger | Personnel + Roster Manager | Scheduled vs actual duty hours, corrections |
| Workload review | Personnel | Formal request for operational workload review |
| Assignment management | Roster Manager | Create assignments with pre-assignment capacity check |
| Workload distribution | Commander / Roster Manager | Per-person duty summary with policy warnings |
| Rebalancing planner | Commander / Roster Manager | Scenario planning with honest feasibility output |
| Unit aggregate view | Commander | Welfare priority distribution (no individual data) |
| Admin panel | Administrator | User, unit, and policy management |

---

## 3. The Four Roles

SAHAYAK has four server-assigned roles. Roles **cannot be changed by the client** — they come from the database via the session cookie.

### 3.1 Personnel
The service member using the system for themselves.

**Can do:**
- Submit voluntary daily check-ins (mood, sleep, fatigue, workload, concern)
- Request confidential welfare support at any time — no score required
- View their own check-in history and assessment trend
- Manage their own wellness consent (grant / withdraw)
- View their own duty ledger (scheduled vs actual hours)
- Submit duty correction requests (report actual hours, report unrecorded duty)
- Submit workload review requests (formal operational concern)
- View their own assignments

**Cannot do:**
- See anyone else's data
- See their own welfare assessment score (that is a welfare officer tool)
- Access organizational records directly

### 3.2 Welfare Officer
A trained welfare professional assigned to a unit.

**Can do:**
- View the welfare case queue for their assigned unit
- Open case profiles with explainable assessment factors
- Add confidential notes (not visible to commanders or HR)
- Record interventions, schedule follow-ups
- Update case status through the state machine
- Import organizational data (CSV) for their unit
- View duty context for personnel they are reviewing (operational data only, no wellness)

**Cannot do:**
- See data outside their assigned unit
- Access commander-level aggregates
- Edit assignments or rosters

### 3.3 Commander
An authorized commander who needs operational and welfare aggregate data.

**Can do:**
- View welfare priority distribution by unit (aggregate only, min group size enforced)
- Run workload scenario planner (sliders for night-shift and hour reduction)
- View workload distribution per person — **only if explicitly granted duty-manager-access**
- Acknowledge and respond to workload review requests — if granted DMA
- View rebalancing scenarios for their unit

**Cannot do:**
- See individual wellness check-ins, sleep/fatigue data, or mood responses
- See counselling notes or support request content
- Access welfare officer's confidential case notes

### 3.4 Administrator
Manages the system. Does NOT automatically get access to sensitive welfare content.

**Can do:**
- Create and manage user accounts
- Assign roles and unit memberships
- Create and configure units and workload policies
- Reset passwords (invalidates all sessions)
- Disable accounts (immediately blocks next request)
- Grant duty-manager-access permissions

**Cannot do:**
- Read confidential welfare case notes
- View individual wellness data

---

## 4. How the Data is Separated

This is the most important design decision in SAHAYAK.

```
┌─────────────────────────────────────────────────────────┐
│                  WELFARE ANALYTICS                       │
│  check_ins · consent_records · assessments              │
│  welfare_cases · case_notes · interventions             │
│  support_requests · alert_feedback                      │
│                                                          │
│  Visible to: Personnel (own) · Welfare Officer (unit)   │
│  NOT visible to: Commander · Admin                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│               OPERATIONAL ROSTER DATA                    │
│  duty_ledger · duty_corrections · assignments           │
│  workload_review_requests · rebalancing_scenarios       │
│  unit_workload_policies · duty_manager_access           │
│                                                          │
│  Visible to: Personnel (own) · Roster Manager (unit)   │
│  Commander (aggregate or with explicit DMA)             │
│  NOT visible to: Welfare Officer (except duty context)  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│             ORGANIZATIONAL RECORDS                       │
│  duty_records · deployment_records · leave_records      │
│  transfer_records · training_records                    │
│                                                          │
│  Imported via CSV. Fed into welfare assessment engine.   │
│  Visible to: Assessment engine · Welfare Officer        │
└─────────────────────────────────────────────────────────┘
```

**Key rule:** No operational API endpoint ever returns wellness, mood, fatigue, counselling notes, or psychological scores. This is enforced at the API layer, not just in the UI.

---

## 5. The Welfare Assessment Engine

The engine calculates a transparent, reproducible welfare indicator score from authorized records and voluntary check-ins.

### 5.1 How it works

Every assessment:
1. Reads the active rule version from the database
2. Queries duty, deployment, leave, transfer and training records (real DB queries)
3. Reads wellness data only if consent is currently granted
4. Runs `calculateAssessment()` — a pure function with no side effects
5. Stores the result with: rawScore, maxPossibleScore, priority, all factors, explanation, which rule version, and a timestamp
6. Optionally calls Gemini AI for a plain-language summary (anonymized factors only — never names, IDs, or notes)

### 5.2 The 10 Factors (RULES_V1)

**Organizational (always scored):**

| Factor | Moderate | High |
|--------|----------|------|
| Weekly duty hours | >48h = 10pts | >60h = 20pts |
| Night shifts this month | >5 = 10pts | >8 = 20pts |
| Consecutive duty days | >6d = 8pts | >10d = 15pts |
| Deployment duration | >20d = 8pts | >45d = 15pts |
| Days since last leave | >60d = 7pts | >90d = 15pts |
| Transfers (6 months) | ≥1 = 5pts | ≥2 = 10pts |
| Training days (30d) | >10d = 4pts | >20d = 8pts |

**Voluntary wellness (only when consent + data present):**

| Factor | Moderate | High |
|--------|----------|------|
| Self-reported sleep | <5h = 8pts | <4h = 15pts |
| Self-reported fatigue | ≥6/10 = 8pts | ≥8/10 = 15pts |
| Perceived workload | ≥6/10 = 5pts | ≥8/10 = 10pts |

**Priority levels:** Elevated ≥55 pts · Watch ≥25 pts · Routine <25 pts  
**Maximum possible:** 143 pts (all 10 factors at high tier) · 103 pts (org only)

### 5.3 Critical rules
- Missing wellness data = **zero points** — silence never counts against someone
- Score is shown as `rawScore / maxPossibleScore` — never `/100`
- A support request bypasses score and creates a case regardless of number
- These thresholds are illustrative and **not clinically validated**

### 5.4 When assessments refresh
- Check-in submitted or edited
- CSV import committed (all affected personnel)
- Wellness consent withdrawn (wellness factors removed from new assessment)
- Duty correction approved
- Always marks previous assessment `isLatest=false` — history preserved

---

## 6. The Welfare Case Workflow

```
New → Reviewed → Contacted → Intervention Agreed → Follow-up → Closed
                                                              ↘ Dismissed (reason required)
```

- Transitions are validated **server-side** — invalid jumps rejected
- Each transition is stored in `case_status_history`
- Confidential notes visible only to the assigned welfare officer
- Case priority auto-syncs with latest assessment when a case is opened
- Overdue follow-ups highlighted in red on the follow-ups page
- A separate `alert_feedback` table records when an officer marks an assessment as a false alert

---

## 7. The Workload Module

Added to address the operational side — duty overload, recovery, and scheduling.

### 7.1 Duty Ledger vs Duty Records

| Table | Purpose |
|-------|---------|
| `duty_records` | Weekly aggregate — feeds the welfare assessment engine |
| `duty_ledger` | Per-shift entries with scheduled AND actual times — operational planning |

Both tables coexist. The ledger feeds updated `duty_records` after verification.

### 7.2 Duty Calculations (lib/workload.ts)

Pure functions, no database access:

- **computeDutyDurations** — scheduled vs actual, handles overnight, missing actual, future duties, cancelled
- **nightDurationMinutes** — minute-accurate, handles midnight-crossing night windows (default 22:00–06:00)
- **consecutiveDutyDays** — counts backwards from today using local-timezone calendar dates
- **recoveryIntervalMinutes** — gap between duties, uses verified actual times when available
- **detectOverlap** — checks proposed intervals against existing duties (excludes cancelled)
- **checkAssignmentCapacity** — returns structured findings (blocking / warning / informational / insufficient_data)
- **generateScenario** — honest infeasibility when staffing can't meet requirements; never silently relaxes constraints

### 7.3 Unit Workload Policy

Every unit has a configurable policy (stored in `unit_workload_policies`):

| Setting | Default demo value |
|---------|-------------------|
| Night duty window | 22:00 – 06:00 |
| Warning: weekly hours | >48h |
| Block: weekly hours | >60h |
| Warning: consecutive days | >6 days |
| Block: consecutive days | >10 days |
| Warning: min recovery | <10h |
| Block: min recovery | <8h |
| Night shifts warning | >8/month |
| Max additional hours | >10h/week |

**All demo policies are labeled** "DEMONSTRATION CONFIGURATION ONLY — not a legal standard."

### 7.4 Pre-Assignment Capacity Check

Before any assignment is confirmed, the system runs `checkAssignmentCapacity()`:

1. Checks for leave conflicts → **blocking**
2. Checks for duty overlaps → **blocking**
3. Checks recovery interval before and after → **blocking or warning** depending on gap
4. Checks consecutive days → **blocking or warning**
5. Checks weekly additional hours → **warning**
6. Checks for missing effort estimate → **insufficient_data**

**Blocking findings** cannot be overridden. **Warnings** require an explicit override reason (stored with the assignment). The capacity check result is saved alongside the assignment record.

### 7.5 Rebalancing Planner

Commanders and roster managers can generate workload scenarios:
- Input: date range, required staffing per day, current roster and leave
- Output: feasible scenario with proposals, OR honest infeasibility explanation
- Proposals include: night-shift rotation, additional-duty redistribution, recovery reservation
- Scenarios are `draft → reviewed → approved → applied`
- Apply sends notifications to affected personnel
- Wellness data is **never** used in any scenario calculation

---

## 8. Authentication & Security

### 8.1 Login flow
1. `POST /api/auth/login` with email + password
2. bcrypt.compare (12 rounds — takes ~800ms intentionally)
3. Rate limit: 5 attempts per 15 min per email+IP (in-memory; needs Redis for multi-instance)
4. Session row created in `sessions` table with random UUID
5. HttpOnly SameSite=Lax cookie set — JavaScript cannot read it
6. CSRF token returned in login response, required on every subsequent write

### 8.2 Session validation
Every request calls `getSession()`:
- Reads session ID from cookie
- JOINs `sessions` with `users` — gets role, unitId, isActive from the database
- If `isActive = false` → returns null immediately (disabled accounts block instantly)
- Extends `lastAccessedAt` on each access

### 8.3 Authorization model
Every API route:
1. Calls `getSession()` — server-assigned role, cannot be overridden by client
2. Checks role against allowed roles
3. Checks unit scope (welfare officers: `users.unitId === session.unitId`)
4. Validates CSRF token on writes
5. Records audit event

### 8.4 Honest security limitations
- Rate limiter is **in-process** — does not persist across server restarts, not suitable for multi-instance
- Audit log is a **regular database table** — not cryptographically tamper-proof
- Case notes are stored as **plaintext** — field-level encryption requires KMS in production
- Sessions expire after 8 hours; no refresh token mechanism

---

## 9. Database Schema — 36 Tables

### Core identity
`units` · `users` · `sessions` · `login_attempts`

### Personnel
`personnel_profiles` · `record_correction_requests`

### Organizational records (welfare assessment inputs)
`duty_records` · `deployment_records` · `leave_records` · `transfer_records` · `training_records` · `import_jobs` · `import_errors`

### Wellness (confidential)
`consent_records` · `check_ins`

### Welfare assessment
`rule_versions` · `assessments` · `assessment_factors`

### Welfare workflow (confidential)
`support_requests` · `welfare_cases` · `case_status_history` · `interventions` · `case_notes` · `alert_feedback` · `appointments`

### Workload module (operational)
`unit_workload_policies` · `skills` · `personnel_skills` · `duty_ledger` · `duty_corrections` · `assignments` · `workload_review_requests` · `rebalancing_scenarios` · `duty_manager_access`

### Shared infrastructure
`notifications` · `audit_events`

---

## 10. API Surface

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login, returns session cookie + CSRF token |
| `/api/auth/logout` | POST | Destroys session |
| `/api/auth/me` | GET | Returns current user + CSRF token |
| `/api/health` | GET | Database connectivity check |

### Personnel (role: personnel)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/personnel/checkin` | GET / POST | View history / submit check-in |
| `/api/personnel/consent` | GET / POST | View / update consent |
| `/api/personnel/support` | GET / POST | View / submit support requests |

### Welfare Officer (role: welfare_officer)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/welfare/cases` | GET / POST | Case queue / open or update case |
| `/api/welfare/notes` | GET / POST | Confidential notes on a case |
| `/api/welfare/interventions` | GET / POST | Record interventions |
| `/api/import` | POST | CSV import (preview + commit) |

### Commander (role: commander)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/commander/aggregates` | GET | Unit welfare priority distribution |
| `/api/commander/scenario` | POST | Existing welfare indicator scenario |

### Workload Module (all roles, scoped)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workload/duty-ledger` | GET / POST / PATCH | View / create / verify duty entries |
| `/api/workload/corrections` | GET / POST / PATCH | Report / review duty corrections |
| `/api/workload/assignments` | GET / POST / PATCH | Create / approve assignments |
| `/api/workload/reviews` | GET / POST / PATCH | Workload review requests |
| `/api/workload/distribution` | GET | Per-person duty summary (DMA required) |
| `/api/workload/policies` | GET / POST | View / create unit policies (admin) |
| `/api/workload/planner` | GET / POST / PATCH | Scenario planning |
| `/api/workload/context` | GET | Duty context for welfare case review |

### Admin (role: admin)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/users` | GET / POST | User management |
| `/api/admin/units` | GET / POST | Unit management |
| `/api/notifications` | GET / POST | Notification management |

---

## 11. UI Pages

### Personnel
| Page | Route | Purpose |
|------|-------|---------|
| My Dashboard | `/personnel/dashboard` | Check-in history, support status, trends |
| Check-in | `/personnel/checkin` | Submit mood, sleep, fatigue |
| Get Support | `/personnel/support` | Confidential welfare support request |
| My Duty & Recovery | `/workload/recovery` | Scheduled vs actual duty, corrections |
| My Assignments | `/workload/assignments` | Active/past operational tasks |
| Workload Review | `/workload/reviews` | Submit formal workload concern |

### Welfare Officer
| Page | Route | Purpose |
|------|-------|---------|
| Overview | `/welfare` | Case queue with metrics |
| Welfare Cases | `/welfare/cases` | Searchable, filterable case list |
| Case Detail | `/welfare/cases/[id]` | Assessment factors, notes, status |
| Follow-ups | `/welfare/followups` | Overdue and upcoming follow-ups |
| Import Records | `/welfare/import` | CSV upload with preview |

### Commander
| Page | Route | Purpose |
|------|-------|---------|
| Unit Overview | `/commander` | Welfare aggregates + scenario planner |
| Workload Distribution | `/roster/distribution` | Per-person duty summary (DMA required) |
| Workload Requests | `/roster/workload-requests` | Review operational concerns |
| Rebalancing Planner | `/roster/planner` | Generate and apply scenarios |

### Admin
| Page | Route | Purpose |
|------|-------|---------|
| Administration | `/admin` | Users, units, roles |

### Shared
| Page | Route | Purpose |
|------|-------|---------|
| Privacy & Access | `/privacy` | Consent management, audit history |
| Problem & Approach | `/problem` | In-app problem statement |
| Notifications | `/notifications` | In-app notification queue |

---

## 12. How Everything Connects — End-to-End Flow

### Flow A: Personnel submits a check-in

```
1. Personnel opens /personnel/checkin
2. Verifies wellness consent exists in DB (403 if not)
3. Submits mood, sleep, fatigue, workload, optional concern
4. POST /api/personnel/checkin
   ├── Validates CSRF
   ├── Verifies consent again server-side
   ├── Inserts into check_ins table
   ├── Calls computeAndStoreAssessment()
   │     ├── Reads duty_records, deployment_records, leave_records (real data)
   │     ├── Reads this check-in's wellness values (consent confirmed)
   │     ├── Runs calculateAssessment() → rawScore, factors, priority
   │     ├── Calls Gemini API (if key configured, consent exists) for plain-language summary
   │     ├── Marks previous isLatest assessment as false
   │     └── Inserts new assessment + factors
   └── If requestedSupport=true:
         ├── Inserts support_request
         └── Notifies welfare officers in the unit (role=welfare_officer filter)
5. Dashboard updates with new check-in history
```

### Flow B: Welfare officer reviews a case

```
1. Welfare Officer opens /welfare → sees case queue (unit-scoped)
2. Clicks a case → /welfare/cases/[id]
3. GET /api/welfare/cases sends officer's unitId from server session (not client)
4. Case detail page loads:
   ├── Fetches latest isLatest=true assessment for the personnel
   ├── Auto-syncs case.priority with assessment.priority if they differ
   ├── Loads assessment factors (no wellness values shown directly)
   ├── Loads GET /api/workload/context for duty context (org data only)
   └── Loads confidential notes
5. Officer adds a note → POST /api/welfare/notes (audited)
6. Officer updates status → POST /api/welfare/cases (state machine validated server-side)
7. Status change triggers notification to personnel
```

### Flow C: Commander runs workload scenario

```
1. Commander opens /roster/planner
2. POST /api/workload/planner
   ├── Checks duty_manager_access for this unit (403 if none)
   ├── Fetches unit members' duty_ledger entries and approved leave
   ├── Builds member capacity summaries (NO wellness data ever queried)
   ├── Calls generateScenario() → feasible or infeasibility explanation
   ├── Stores scenario as "draft" in rebalancing_scenarios
   └── Returns result with mandatory disclaimer
3. Commander marks scenario as "reviewed" → "approved"
4. Commander clicks "Apply to live roster"
   ├── PATCH /api/workload/planner { action: "apply" }
   ├── Checks canApplyScenarios permission (403 if not granted)
   ├── Checks scenario.status === "approved"
   ├── Records appliedBy, appliedAt
   └── Sends notifications to affected personnel
```

### Flow D: Duty correction (Scenario A demo)

```
1. Personnel views /workload/recovery
   ├── GET /api/workload/duty-ledger returns their entries
   ├── Entries with missing actual times are labeled "No recorded actual time"
   └── Future duties labeled "Not yet" (never treated as completed)
2. Personnel clicks correction button on a past entry
3. POST /api/workload/corrections
   ├── Stored as status="submitted" (evidence, not auto-applied)
   └── Notifies roster managers (canEditRoster)
4. Roster manager opens /roster/corrections (accessible via distribution page)
5. PATCH /api/workload/corrections { decision: "approved" }
   ├── No self-approval check (reporter cannot approve own correction)
   ├── Updates duty_ledger with actual times and recalculates derived fields
   └── Calls computeAndStoreAssessment() → fresh welfare assessment
6. Personnel sees "Approved" status in their correction history
```

---

## 13. Privacy Architecture — What Commanders Can Never See

This is enforced in code, not just in the UI:

```typescript
// Every operational API response:
return NextResponse.json({
  // Operational fields only ─────────────────────
  scheduledHours: ...,
  verifiedActualHours: ...,
  additionalHours: ...,
  nightShifts: ...,
  // ─────────────────────────────────────────────
  // These fields DO NOT EXIST in this response:
  // mood: NEVER
  // sleepHours: NEVER
  // fatigue: NEVER
  // counsellingNotes: NEVER
  // assessmentScore: NEVER
  // ─────────────────────────────────────────────
  privacyNote: "Duty records only. Wellness data excluded."
});
```

Commander welfare aggregate API additionally applies:
- **Minimum group size suppression** (default: 10 people) — smaller groups return `suppressed: true`
- Aggregate-only format: `{ elevated, watch, routine, avgHours, avgNights }` — no individual scores

---

## 14. Notifications

In-app notifications (stored in `notifications` table, polled on page load):

| Event | Who gets notified |
|-------|-------------------|
| Support request submitted | Welfare officers in the unit |
| Case status changed | Personnel (the case subject) |
| Case assigned | Assigned welfare officer |
| Duty correction submitted | Roster managers in the unit |
| Assignment created | The assignee |
| Assignment status changed | The assignee |
| Workload review submitted | Duty managers in the unit |
| Workload review updated | The requester |
| Scenario applied | All affected personnel |

**Status accuracy rules:**
- "Request submitted" = row persisted in DB
- "Added to queue" = in-app notification created
- "Acknowledged" = requires explicit officer action
- Never says "notified" merely because a DB row was inserted

Optional email via SMTP (Mailhog locally). Generic messages only — no sensitive details in email body.

---

## 15. Internationalization

English and Hindi translations via next-intl. Coverage:
- All navigation labels
- Auth flows
- Check-in form
- Consent and privacy text
- Support request
- Case statuses and intervention types
- Import labels
- Commander scenario labels
- Error messages

Language toggle in sidebar (EN/HI cookie-based, no page reload required).

---

## 16. Experimental ML Pipeline

Located at `scripts/ml/` — **disabled by default, not used in production assessments.**

- `generate_synthetic_data.py` — 500 fictional personnel × 12 monthly observations = 6,000 rows
- `train_model.py` — Decision Tree (interpretable baseline) + Random Forest (comparison)
- Labels come from the rule engine — models learn to reproduce the rules, NOT real welfare outcomes
- All outputs explicitly labeled: "Rule reproduction only, not clinical validity"
- Results include: precision, recall, F1, AUC-ROC, confusion matrix, feature importances
- Enabled via `ENABLE_ML_FEATURES=true` environment flag

---

## 17. Running the Application

### Local (no Docker)
```bash
npm install --legacy-peer-deps
cp .env.example .env.local        # set SESSION_SECRET at minimum
npx tsx scripts/seed.ts           # creates base demo data
npx tsx scripts/seed-workload.ts  # creates workload demo data
npm run build
npx next start -p 3000
```

### Docker (recommended)
```bash
docker compose up --build
# App at http://localhost:3000
# Mailhog at http://localhost:8025
```

### Demo credentials
| Role | Email | Password |
|------|-------|----------|
| Personnel | ravi.kumar@sahayak.local | Demo@1234 |
| Welfare Officer | welfare.officer@sahayak.local | Demo@1234 |
| Commander | commander@sahayak.local | Demo@1234 |
| Administrator | admin@sahayak.local | Admin@1234 |

---

## 18. Test Coverage

**167 tests across 7 files — all pass without a database.**

| File | Tests | Covers |
|------|-------|--------|
| `domain.test.ts` | 19 | Rule engine scoring, maxPossibleScore, sleep band, priority |
| `auth.test.ts` | 12 | bcrypt, password validation, rate limiting, CSRF |
| `import.test.ts` | 13 | CSV parsing, date validation, source tag idempotency |
| `authorization.test.ts` | 17 | Cross-personnel access, unit scope, role boundaries |
| `regression.test.ts` | 53 | 13 categories: denominators, welfare workflow, AI consent, concurrency |
| `ai-provider.test.ts` | 6 | Template fallback, PII detection, source labeling |
| `workload.test.ts` | 47 | Overnight duties, overlap, missing actual, recovery policy, permissions |

---

## 19. What is NOT in the System

| Feature | Status |
|---------|--------|
| Live CAPF/HR integration | CSV import only — no live connector claimed |
| Wearable device integration | UI toggle present, backend not connected |
| Field-level note encryption | Notes stored as plaintext — requires KMS in production |
| Appointment conflict detection | Records created, no calendar conflict check |
| Email retry on failure | Logs failure, no automatic retry |
| Multi-instance rate limiting | In-process only — needs Redis for multiple servers |
| Clinical validation | Thresholds are illustrative, NOT validated |
| Bias/subgroup evaluation | Not performed |
| Emergency dispatch | "Call 112" text only — no dispatch integration exists |
| Scenario atomic roster apply | Bookkeeping-only — does not rewrite duty_ledger rows atomically |

---

## 20. Design Principles

1. **Welfare first** — no feature ever automatically creates disciplinary consequences
2. **Human decisions** — the system flags and prioritizes; a human always decides
3. **Honest labeling** — demo policies labeled as demo, AI fallback labeled as template, scores shown as raw/max not percentages
4. **Privacy by design** — data categories separated at the database query level, not just the UI
5. **No silent failures** — missing data reduces coverage score; it never defaults to "healthy"
6. **Reproducible assessments** — same input + same rule version = same output, always
7. **Transparent rules** — every factor, threshold, and rationale is visible to the welfare officer

---

*Last updated: September 2026. All personnel data in this document is synthetic and fictional. Do not enter real sensitive information.*
