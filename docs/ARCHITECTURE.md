# SAHAYAK — Architecture and Data Flow

## System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser / Client                           │
│  React 19 · TypeScript · Tailwind CSS · Shadcn UI · Recharts        │
│  Role-specific dashboards: Personnel / Welfare / Commander / Admin  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS (localhost:3000 in dev)
┌────────────────────────────▼────────────────────────────────────────┐
│                    Next.js 15 App Router (Node.js)                  │
│                                                                     │
│  Middleware (middleware.ts)                                          │
│    ├── Session cookie check → redirect to /login if absent          │
│    └── next-intl locale resolution                                  │
│                                                                     │
│  App Router Pages (app/**)                                          │
│    ├── /login              — public                                 │
│    ├── /personnel/**       — role: personnel                        │
│    ├── /welfare/**         — role: welfare_officer                  │
│    ├── /commander          — role: commander                        │
│    ├── /admin              — role: admin                            │
│    ├── /privacy            — all roles                              │
│    └── /notifications      — all roles                              │
│                                                                     │
│  Route Handlers (app/api/**)                                        │
│    ├── /api/auth/login     — bcrypt verify, session create          │
│    ├── /api/auth/logout    — session destroy                        │
│    ├── /api/auth/me        — session read + CSRF token              │
│    ├── /api/health         — DB ping                                │
│    ├── /api/personnel/**   — check-in, consent, support             │
│    ├── /api/welfare/**     — cases, notes, interventions            │
│    ├── /api/commander/**   — aggregates, scenario                   │
│    ├── /api/import         — CSV upload, validate, commit           │
│    ├── /api/notifications  — read/mark read                         │
│    └── /api/admin/**       — users, units                           │
│                                                                     │
│  Library layer (lib/**)                                             │
│    ├── auth/session.ts     — HttpOnly cookie sessions               │
│    ├── auth/password.ts    — bcrypt hash/verify                     │
│    ├── auth/csrf.ts        — synchronizer token pattern             │
│    ├── auth/rate-limit.ts  — in-memory token bucket                 │
│    ├── auth/require-auth.ts— server-side guards + redirects         │
│    ├── domain.ts           — versioned rule engine                  │
│    ├── audit.ts            — audit event recorder                   │
│    ├── notifications.ts    — in-app + SMTP email                    │
│    ├── ai/provider.ts      — Gemini adapter + template fallback     │
│    └── utils.ts            — shared helpers                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Drizzle ORM (postgres driver)
┌────────────────────────────▼────────────────────────────────────────┐
│                      PostgreSQL 16                                   │
│  24 tables · FK constraints · unique indexes · transactions         │
└─────────────────────────────────────────────────────────────────────┘
                             ┊ optional
┌────────────────────────────▼────────────────────────────────────────┐
│  Mailhog (SMTP capture)   — port 1025/8025  [Docker only]           │
│  Gemini API               — if GEMINI_API_KEY is set                │
│  Python ML service        — if ENABLE_ML_FEATURES=true              │
└─────────────────────────────────────────────────────────────────────┘
```

## Key data flows

### Login
```
POST /api/auth/login
  → rate limit check (in-memory)
  → DB lookup by email
  → bcrypt.compare(password, hash)
  → INSERT sessions (random UUID, CSRF token, expiry)
  → Set-Cookie: sahayak_session (HttpOnly, SameSite=Lax)
  → audit_events INSERT (login)
  → return { user, csrfToken }
```

### Check-in submission
```
POST /api/personnel/checkin
  → getSession() → verify role=personnel
  → validateCsrf(token)
  → check consent_records WHERE scope='wellness_checkins' AND granted=true
  → UPSERT check_ins (today's date = unique key)
  → triggerAssessment():
      → load active rule_version
      → JOIN duty_records, deployment_records, leave_records
      → calculateAssessment() → { score, priority, factors }
      → getAiExplanation() → Gemini || template
      → INSERT assessments + assessment_factors
  → if requestedSupport: INSERT support_requests + notifications
  → audit_events INSERT
```

### Welfare case review
```
POST /api/welfare/cases { action: "update_status" }
  → getSession() → verify role=welfare_officer
  → validateCsrf(token)
  → verify officer.unitId === personnel.unitId (scope enforcement)
  → validate state machine: VALID_TRANSITIONS[current].includes(new)
  → UPDATE welfare_cases WHERE id=? AND version=? (optimistic concurrency)
  → if changed=0: 409 Conflict
  → INSERT case_status_history
  → INSERT notifications for personnel
  → audit_events INSERT
```

### Commander aggregates
```
GET /api/commander/aggregates
  → getSession() → verify role=commander
  → for each unit:
      → count members
      → if count < MIN_GROUP_SIZE: return suppressed=true
      → else: latest assessment scores only (NO wellness data)
      → aggregateUnit() → { elevated, watch, routine, avgHours, avgNights }
  → audit_events INSERT (export_generated)
  → return { units[], minGroupSize, disclaimer }
  → NOTE: Individual check-ins, counselling notes, wellness values NEVER returned
```

## Authorization model

```
Request arrives
  ↓
middleware.ts: session cookie present? → /login if not
  ↓
API route handler: getSession() → full session with user + role
  ↓
Role check: if role not in allowedRoles → 403
  ↓
Scope check:
  personnel    → userId must match target
  welfare_off. → unitId must match personnel's unitId
  commander    → aggregate only; individual data queries blocked
  admin        → full user/unit management; NO counselling note access
  ↓
Business logic
  ↓
Audit event recorded
```

## Privacy enforcement

| Data type | Personnel | Welfare Officer | Commander | Admin |
|-----------|-----------|-----------------|-----------|-------|
| Own profile | ✅ | ✅ (in-scope unit) | ❌ | ✅ |
| Own check-ins | ✅ | ✅ (aggregate trend only visible to commander) | ❌ individual | ❌ |
| Others' check-ins | ❌ | ✅ (in-scope) | ❌ | ❌ |
| Confidential notes | ❌ | ✅ (own) | ❌ | ❌ |
| Unit aggregates | ❌ | ✅ | ✅ (min group size enforced) | ✅ |
| Audit history | Own only | Cases they touched | ❌ | ✅ |

## Assessment engine versioning

```
rule_versions table:
  id | version | rules_json | is_active | created_by | activated_at

Default v1.0.0 is seeded on first run.
Admin can create a new version → set is_active=true on new, false on old.
All assessments record which rule_version_id they used.
Assessments are reproducible: given the same input + rule version → same output.
```
