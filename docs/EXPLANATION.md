# SAHAYAK — Complete Project Explanation

> **What is SAHAYAK?**
> A welfare decision-support system for uniformed service personnel (CAPFs, Armed Forces).
> It analyzes duty records and voluntary wellness check-ins to help welfare officers identify
> who may need a conversation — not to diagnose, not to discipline, not to automate any decision.

---

## Table of Contents

1. [Core Purpose](#1-core-purpose)
2. [Authentication & Security](#2-authentication--security)
3. [Personnel View](#3-personnel-view)
4. [Welfare Officer View](#4-welfare-officer-view)
5. [Commander View](#5-commander-view)
6. [Admin Panel](#6-admin-panel)
7. [Assessment Engine](#7-assessment-engine)
8. [Notifications](#8-notifications)
9. [Privacy & Audit](#9-privacy--audit)
10. [Database](#10-database)
11. [What is NOT Done / Honestly Labeled](#11-what-is-not-done--honestly-labeled)
12. [Experimental ML Pipeline](#12-experimental-ml-pipeline)
13. [What Happens When You Open the App](#13-what-happens-when-you-open-the-app)

---

## 1. Core Purpose

A **welfare decision-support system** for uniformed service personnel (CAPFs, Armed Forces).
It analyzes duty records and voluntary wellness check-ins to help welfare officers identify
who may need a conversation.

**It is NOT:**
- A clinical diagnosis tool
- A disciplinary or performance system
- An automated decision-maker
- A replacement for human welfare officers

---

## 2. Authentication & Security

### What actually works

- Login page at `/login` with email + password
- Passwords hashed with **bcrypt (12 rounds)** — brute force takes years
- Sessions stored in the database with **HttpOnly cookie** so JavaScript cannot steal it
- **CSRF token** generated at login, required on every write operation
- **Rate limiting** — 5 failed attempts per 15 minutes per email+IP, then locked out
- Logout invalidates the session in the database immediately
- Middleware redirects unauthenticated users to `/login` before any page loads
- Roles are **server-assigned** — a user cannot change their own role through the client

### 4 Roles with Hard Server-Enforced Boundaries

| Role | What They Can See |
|------|-------------------|
| **Personnel** | Only their own data |
| **Welfare Officer** | Their assigned unit's cases only |
| **Commander** | Unit aggregates only — no individual data ever |
| **Administrator** | User/unit management — no counselling notes |

### Demo Credentials (Local Demonstration Only)

| Role | Email | Password |
|------|-------|----------|
| Personnel (elevated) | ravi.kumar@sahayak.local | Demo@1234 |
| Welfare Officer | welfare.officer@sahayak.local | Demo@1234 |
| Commander | commander@sahayak.local | Demo@1234 |
| Administrator | admin@sahayak.local | Admin@1234 |

---

## 3. Personnel View

### Dashboard (`/personnel/dashboard`)

Shows:
- Last sleep hours, fatigue score, support request status
- A chart of check-in history (sleep vs fatigue over time)
- Links to submit a new check-in or request support

### Daily Check-in (`/personnel/checkin`)

Fields:
- **Mood** (1–5: Very low → Great)
- **Sleep hours** (slider, 0–16h in 0.5h steps)
- **Sleep quality** (1–5)
- **Fatigue** (1–10)
- **Perceived workload** (1–10)
- **Optional free-text concern** (max 500 characters)
- **Toggle**: "I'd like to speak with a welfare officer"

Behaviour:
- Submitting triggers an **automatic welfare assessment** in the backend
- Editing is allowed only on the same calendar day
- Missing wellness data adds **zero points** — silence never counts against someone

### Consent Management (`/privacy`)

- Toggle **wellness check-ins** on/off
- Withdrawing removes check-in data from future assessments
  (data retained for user's own history view, excluded from scoring)
- Toggle **AI-assisted explanations** (if Gemini API key is configured)
- Wearable integration toggle (UI present, integration not connected — honestly labeled)
- Full **audit history** of who accessed their data

### Support Requests (`/personnel/support`)

- Submit a confidential support request at any time — no score required
- Choose preferred contact method: in-person, phone, or written message
- Set availability window (e.g., "weekday mornings")
- Choose urgency: standard or urgent
- View history of previous requests and acknowledgement status
- Clear warning displayed:
  > "If you are in immediate danger, contact emergency services (dial 112).
  > This system does not dispatch emergency responders."

---

## 4. Welfare Officer View

### Case Queue (`/welfare`)

- Table of all personnel in their assigned unit
- Searchable by name or personnel ID
- Filterable by case status (New, Reviewed, Contacted, etc.)
- Each row shows: name, status, priority badge, last activity date, next follow-up date
- Export to CSV (unit summary only, no individual wellness data)

### Case Detail (`/welfare/cases/[id]`)

- **Assessment factor breakdown** — shows exactly which rule triggered and why
  (e.g., "Weekly duty hours: 68h → +20 points")
- Plain-language explanation of the score
- AI-drafted summary (if Gemini API key configured) — for human review only

**State Machine** — case moves through these states:

```
New → Reviewed → Contacted → Intervention Agreed → Follow-up → Closed
                                                              ↘ Dismissed (with reason)
```

Invalid transitions are **rejected server-side** — you cannot jump from New to Closed directly.

**Actions available:**
- Set follow-up date
- Add **confidential notes** (not visible to commanders, HR, or admin)
- Record an **intervention type**:
  - Confidential welfare conversation
  - Counsellor referral
  - Leave review
  - Duty adjustment proposal
  - Recovery planning
  - Follow-up conversation
  - No action needed

### Follow-ups Page (`/welfare/followups`)

- All cases with a scheduled follow-up date
- **Overdue follow-ups** highlighted in red at the top
- Upcoming follow-ups listed chronologically

### Import Organizational Records (`/welfare/import`)

Supported record types:
- Duty schedules
- Deployments
- Leave records
- Transfers
- Training records

Process:
1. **Download template** (pre-formatted CSV with correct columns)
2. **Upload CSV** → server validates every row
3. **Preview** — shows validation errors row-by-row before committing
4. **Commit** — inserts valid rows, skips duplicates, logs errors
5. **Audit record** created for every import job

Rules:
- Duplicate detection via source tags — re-importing the same file creates no duplicates
- Scoped to officer's unit — cannot import data for other units
- Required column validation, date format validation, numeric range validation

---

## 5. Commander View

### What a Commander Can See

**Unit aggregates only — individual data is architecturally excluded.**

- Distribution bars per unit: how many personnel are Routine / Watch / Elevated
- Average weekly duty hours per unit
- Average night shifts per unit
- Average deployment days per unit

**Small group protection:**
If a unit has fewer than **10 personnel** (configurable per unit), results are suppressed
with a clear explanation — protects individuals in small groups from being identified.

### Workload Scenario Planner

- Two sliders: reduce night shifts (0–6), reduce weekly hours (0–16)
- Click "Compare" → recalculates indicator scores under proposed changes
- Shows "before → after" average workload indicator across the unit

**Clearly labeled:**
> "Estimates only. Based on current duty records and stated rules.
> Does not predict mental-health outcomes. Does not model staffing coverage.
> No real schedules are changed. Wellness indicators are excluded from this view."

### Export

- Downloads a CSV of the unit aggregate table
- Header line marks it as aggregate summary to prevent confusion with individual records

---

## 6. Admin Panel

### User Management (`/admin`)

- View all users with name, email, role, unit, active status, last login
- Search by name, email, or personnel ID
- Filter by role
- **Create new user**: name, email, temporary password, role, unit assignment, personnel ID
- **Edit user**: change role, reassign to different unit
- **Disable/enable account**: disabled users are immediately logged out (all sessions invalidated)
- **Reset password**: sets temporary password, invalidates all active sessions

### Unit Management

- View all units with code, description, minimum group size
- **Create new unit**: name, code, description, minimum group size for aggregate suppression

All admin actions are **audit-logged** with actor ID, action type, and timestamp.

---

## 7. Assessment Engine

### How It Works

The rule engine runs automatically on every check-in submission and produces a
**versioned, reproducible welfare indicator score**.

### 10 Factors Evaluated

| Factor | Kind | Threshold | Max Points |
|--------|------|-----------|-----------|
| Weekly duty hours | Workload | >60h = 20pts, >48h = 10pts | 20 |
| Night shifts this month | Recovery | >8 = 20pts, >5 = 10pts | 20 |
| Consecutive duty days | Recovery | >10 = 15pts, >6 = 8pts | 15 |
| Deployment duration | Deployment | >45 days = 15pts, >20 = 8pts | 15 |
| Days since last leave | Leave | >90 days = 15pts, >60 = 7pts | 15 |
| Transfers (last 6 months) | Transfer | ≥2 = 10pts, ≥1 = 5pts | 10 |
| Training days (last 30) | Workload | >20 = 8pts, >10 = 4pts | 8 |
| Self-reported sleep | Wellness | <4h = 15pts, <5h = 8pts | 15 |
| Self-reported fatigue | Wellness | ≥8/10 = 15pts, ≥6 = 8pts | 15 |
| Perceived workload | Wellness | ≥8/10 = 10pts, ≥6 = 5pts | 10 |

**Total possible: 143 points**

### Priority Levels

| Score | Priority | Color |
|-------|----------|-------|
| 0 – 24 | **Routine** | Green |
| 25 – 54 | **Watch** | Yellow/Amber |
| 55+ | **Elevated** | Orange |

### Key Constraints

- Missing wellness data = **zero points** — silence never counts against someone
- A support request bypasses score entirely — creates a welfare case regardless of score
- Scores are explicitly labeled as "welfare prioritization aids, not clinical diagnoses"
- The score is **not** a probability of any condition
- Every assessment stores: score, priority, all factor values, plain-language explanation,
  rule version used, and data availability coverage

### Rule Versioning

- Rules are stored in a `rule_versions` database table
- Admins can create new versions and activate them
- Every assessment records which rule version it used
- Old assessments remain reproducible — inputs + rule version → same output

### AI-Assisted Explanations (Optional)

- If `GEMINI_API_KEY` is set, the Gemini API generates a plain-language summary
- If not set, a template explanation is used (clearly labeled as template)
- **What is sent to Gemini**: factor names and scores only
- **What is NEVER sent**: names, personnel IDs, unit locations, free-text notes
- The AI may summarize factors, explain results, draft a welfare summary for human review
- The AI cannot change scores, diagnose conditions, or make disciplinary recommendations

---

## 8. Notifications

### In-App Notifications (Working)

Generated for:
- **Support request received** → welfare officer in the unit notified
- **Case status changed** → personnel member notified
- **New case assigned** → welfare officer notified
- **Follow-up due** → surfaced in the Follow-ups page as overdue indicators

All notifications stored in the database, polled on page load, markable as read.

### Email Notifications (Optional)

- Requires SMTP configuration in `.env.local`
- For local development: Mailhog captures emails at `http://localhost:8025` (Docker only)
- Email content is **generic** — no sensitive clinical details in email body
- Failed sends are logged; no automatic retry in current version

---

## 9. Privacy & Audit

### Consent Records

Three consent scopes per user:

| Scope | What It Controls |
|-------|-----------------|
| `wellness_checkins` | Whether mood/sleep/fatigue data is used in assessments |
| `wearable` | Wearable device data (not yet connected) |
| `ai_processing` | Whether anonymized factors are sent to Gemini |

Each consent record stores: scope, policy version, grant timestamp, withdrawal timestamp, IP address.

Withdrawing wellness consent:
- Stops new check-in data from being included in future assessments
- Historical check-ins retained for the user's own history view
- Does not delete the assessment history that was already calculated

### Audit Events Logged

Every significant action creates an audit record:

| Event Type | Triggered By |
|-----------|-------------|
| login / logout | Any user sign-in or sign-out |
| login_failed | Wrong password attempt |
| profile_accessed | Welfare officer opens a case |
| checkin_submitted / checkin_edited | Personnel submits or edits a check-in |
| consent_granted / consent_withdrawn | Personnel changes consent |
| support_requested | Personnel submits a support request |
| case_accessed / case_updated | Welfare officer views or updates a case |
| note_created / note_accessed | Confidential notes |
| export_generated | CSV download |
| import_committed | CSV import |
| role_changed / unit_assigned | Admin changes |
| assessment_generated | Rule engine runs |
| ai_explanation_requested | Gemini API called |

Personnel can see their own access history in the Privacy page.
Commanders cannot see any individual audit histories.

### Honest Limitation on Audit

> Audit records are stored in a regular PostgreSQL/PGlite table with timestamps.
> They are **NOT** cryptographically signed or append-only at the database level.
> Direct database access can modify them.
> This is operational audit history, not a tamper-proof compliance ledger.
> For production use requiring immutability, replace with an append-only write path
> (e.g., WAL streaming, Ledger DB, or external SIEM).

---

## 10. Database

### Engine

- **Production / Docker**: PostgreSQL 16
- **Local development (no server needed)**: PGlite (WASM PostgreSQL, persists to `.pglite/`)
- ORM: Drizzle ORM
- Migrations: `drizzle-kit` (SQL migration files in `drizzle/`)

### 27 Tables

| Table | Purpose |
|-------|---------|
| `units` | Organizational units (Alpha, Bravo, Charlie…) |
| `users` | Accounts with server-assigned roles |
| `sessions` | DB-backed sessions (HttpOnly cookie auth) |
| `login_attempts` | Rate-limiting and login audit |
| `personnel_profiles` | Rank, service number, profile metadata |
| `duty_records` | Weekly hours, night shifts, consecutive days |
| `deployment_records` | Deployment periods and locations |
| `leave_records` | Leave history |
| `transfer_records` | Inter-unit transfers |
| `training_records` | Training commitments |
| `import_jobs` | CSV import audit with row counts |
| `import_errors` | Per-row validation errors from imports |
| `consent_records` | Scope-level consent with full withdrawal history |
| `check_ins` | Daily voluntary wellness responses |
| `rule_versions` | Versioned, configurable assessment rules |
| `assessments` | Scored assessments with explanation text |
| `assessment_factors` | Per-factor point breakdown for each assessment |
| `support_requests` | Confidential support requests |
| `welfare_cases` | Case workflow with state machine |
| `case_status_history` | Full transition log for every case |
| `interventions` | Recorded welfare actions per case |
| `case_notes` | Confidential welfare officer notes |
| `alert_feedback` | False-alert feedback from officers |
| `appointments` | Scheduled welfare meetings |
| `notifications` | In-app notification queue |
| `audit_events` | Complete action history log |
| `record_correction_requests` | Personnel disputes of organizational data |

---

## 11. What is NOT Done / Honestly Labeled

| Feature | Current Status |
|---------|---------------|
| Wearable device integration | UI toggle exists, backend not connected |
| Live CAPF / Armed Forces HR integration | CSV import only — no live connector exists or is claimed |
| Appointment conflict detection | Appointment records created, no calendar conflict check |
| Email retry on delivery failure | Logs failure, no automatic retry |
| Field-level encryption for notes | Notes stored as plaintext — requires KMS in production |
| Emergency dispatch | Replaced with "call 112" text — no dispatch integration |
| Multi-instance rate limiting | In-process token bucket — needs Redis for multiple servers |
| Clinical validation of thresholds | Thresholds are illustrative and have NOT been validated |
| Bias/subgroup evaluation | Not performed |
| Audit tamper-evidence | Regular DB table, not cryptographically signed |

---

## 12. Experimental ML Pipeline

**Location:** `scripts/ml/`

**Explicitly for technical demonstration only — not used in production assessments.**

### Scripts

| Script | What It Does |
|--------|-------------|
| `generate_synthetic_data.py` | Creates 6,000 fictional personnel observations with realistic variation |
| `train_model.py` | Trains Decision Tree (interpretable) + Random Forest (comparison) |
| `requirements.txt` | Python dependencies: pandas, numpy, scikit-learn |
| `README.md` | Full limitations documentation |

### What the ML Outputs

- Precision, Recall, F1, AUC-ROC per model
- Confusion matrix
- Feature importances (Random Forest)
- Key error cases (false negatives = missed elevations, false positives = over-flagged)

### Critical Honest Statement

> **Labels are generated by the rule engine.**
> The model learns to reproduce the rules, not to detect real-world welfare needs.
> A high F1 score (often 0.95+) means the model reproduced the rules well.
> It does NOT mean the model would correctly identify personnel needing welfare support.
> This requires: representative real data, independent clinical outcome labels,
> domain expert review, calibration, and subgroup evaluation before any operational use.

---

## 13. What Happens When You Open the App

### Step-by-Step Flow

```
1. Open http://localhost:3000
   └── Middleware checks for session cookie
       └── No cookie → redirect to /login (9ms)

2. Login page loads instantly (pre-built, ~137ms)
   └── SAHAYAK branding with navy/teal design
   └── Demo credentials panel (click to auto-fill)

3. Submit login credentials
   └── POST /api/auth/login
   └── bcrypt.compare(password, hash) — ~800ms (intentional security cost)
   └── Session created in database
   └── HttpOnly SameSite=Lax cookie set
   └── Redirect based on role:
       ├── personnel → /personnel/dashboard
       ├── welfare_officer → /welfare
       ├── commander → /commander
       └── admin → /admin

4. Personnel (Ravi Kumar — S-1042)
   └── Dashboard shows 5 days of check-in history
   └── Elevated indicator (score ~63/100) due to:
       - 68h weekly duty (+20pts)
       - 9 night shifts (+20pts)
       - 4.5h sleep (+15pts)
       - Fatigue 8/10 (+15pts)
   └── Open support request visible

5. Welfare Officer
   └── Case queue with 36 personnel
   └── Ravi Kumar's case at top (Elevated, New status)
   └── Open case → see all contributing factors
   └── Add note, change status, set follow-up date

6. Commander
   └── Unit aggregate bars (Alpha/Bravo/Charlie)
   └── No individual names, scores, or wellness data visible
   └── Scenario planner — adjust sliders, see estimated change

7. Admin
   └── Full user table with 40 accounts
   └── Create/edit users, assign roles and units
```

### Response Times (Production Mode)

| Route | Time |
|-------|------|
| GET /login | ~137ms |
| GET /api/health | ~16ms |
| POST /api/auth/login | ~900ms (bcrypt) |
| GET / (redirect) | ~9ms |
| Page navigation (subsequent) | <200ms |

---

## Technical Stack Summary

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Node.js) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, Shadcn UI |
| Charts | Recharts 2 |
| Database (dev) | PGlite (WASM PostgreSQL, zero install) |
| Database (prod) | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Auth | Custom bcrypt + HttpOnly session cookie |
| Testing | Vitest (67 tests, all passing) |
| i18n | next-intl (English + Hindi) |
| ML | Python 3, scikit-learn (experimental, isolated) |
| Containerization | Docker Compose (app + PostgreSQL + Mailhog) |

---

*Last updated: September 2026*
*All personnel data in this document is synthetic and fictional.*
*Do not enter real personal or sensitive information.*
