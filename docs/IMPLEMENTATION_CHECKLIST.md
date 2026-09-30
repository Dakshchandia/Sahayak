# SAHAYAK — Implementation Checklist

_Updated automatically as work progresses. Last: scaffold phase._

## Identified Gaps in Existing Prototype

| # | Gap | Severity |
|---|-----|----------|
| G1 | Authentication tied to ChatGPT/Cloudflare platform headers — cannot run locally without proprietary infra | Critical |
| G2 | Single JSON workspace blob replaces all relational data — no foreign keys, no joins, no proper indexing | Critical |
| G3 | Role switching is client-side only — any user can call any role's API endpoint | Critical |
| G4 | No real user accounts, passwords, sessions or login | Critical |
| G5 | All 36 personnel live in one user's blob — no multi-user support | Critical |
| G6 | No CSRF protection on mutations | High |
| G7 | No rate limiting on login or API | High |
| G8 | Counselling notes stored as plain text in a shared JSON column — no field-level protection | High |
| G9 | Audit log capped at 500 in-memory entries, cleared on seed reset | High |
| G10 | No organizational data import path (CSV, validation, preview, idempotency) | High |
| G11 | Assessment engine not versioned or configurable | Medium |
| G12 | Commander view has no minimum-group-size enforcement beyond seed data | High |
| G13 | No appointment scheduling with conflict detection | Medium |
| G14 | No in-app notification system | Medium |
| G15 | No Docker Compose or documented local startup sequence | High |
| G16 | storage.ts imports `cloudflare:workers` — breaks outside Workers runtime | Critical |
| G17 | No consent-version tracking or withdrawal audit | Medium |
| G18 | No i18n structure | Low |
| G19 | No automated tests | High |
| G20 | No Admin panel | Medium |

## Implementation Stages

### Stage 1 — Foundation ✅ In progress
- [x] Gap audit (this document)
- [ ] New package.json with local Next.js + PostgreSQL deps
- [ ] Project restructure (src/, server/, lib/)
- [ ] .env.example
- [ ] Docker Compose
- [ ] Schema migrations (drizzle-orm + pg)
- [ ] Seed script

### Stage 2 — Authentication & Authorization
- [ ] bcrypt password hashing
- [ ] Session table + HttpOnly cookie sessions
- [ ] Login rate limiting (in-memory / redis)
- [ ] CSRF token generation and validation
- [ ] Auth middleware (server components + API routes)
- [ ] Role/unit assignment — server-enforced

### Stage 3 — Core Data APIs
- [ ] Personnel profile CRUD
- [ ] Check-in CRUD with backend assessment trigger
- [ ] Consent management
- [ ] Support request workflow
- [ ] Welfare case state machine
- [ ] Intervention recording
- [ ] Appointment scheduling
- [ ] Follow-up management
- [ ] Notification generation

### Stage 4 — Organizational Data Import
- [ ] CSV upload endpoint
- [ ] Column validation
- [ ] Preview route
- [ ] Commit route with duplicate detection
- [ ] Import job audit records

### Stage 5 — Assessment Engine
- [ ] Rule engine v1 (port existing factors + add transfer/training/incidents)
- [ ] Versioning table + reproducibility
- [ ] Assessment factor storage
- [ ] AI explanation adapter (Gemini + template fallback)

### Stage 6 — Role UIs
- [ ] Personnel dashboard
- [ ] Welfare officer dashboard + case sheet
- [ ] Commander aggregate + scenario planner
- [ ] Admin panel

### Stage 7 — Audit, Consent, Privacy
- [ ] Audit event service
- [ ] Consent withdrawal cascade
- [ ] Data access history view
- [ ] Retention jobs (placeholder)

### Stage 8 — Tests
- [ ] Authorization tests
- [ ] Core workflow integration tests

### Stage 9 — Docs
- [ ] Architecture + data flow
- [ ] API reference
- [ ] SIH demo walkthrough
- [ ] Limitations (truthful)

### Stage 10 — Experimental ML
- [ ] Synthetic data generator (Python)
- [ ] Model training script
- [ ] Evaluation report

## Technology Decisions

| Concern | Choice | Reason |
|---------|--------|--------|
| Runtime | Next.js 15 App Router (Node.js) | Eliminates Cloudflare Workers dependency; runs locally with `npm run dev` |
| Database | PostgreSQL 16 via Docker | Relational, supports FK constraints, transactions, proper indexes |
| ORM | Drizzle-orm (pg dialect) | Already in project; minimal change to schema layer |
| Migrations | drizzle-kit push / migrate | Already configured |
| Auth | Custom session-cookie auth | No external OAuth dependency for local demo |
| Password | bcryptjs | Pure JS, no native module issues on Windows |
| Sessions | DB-backed sessions, HttpOnly Secure SameSite=Lax cookie | Proper session invalidation |
| CSRF | Synchronizer token (double-submit cookie pattern) | Compatible with Next.js Server Actions |
| Rate limiting | In-memory token bucket (prod: Redis adapter) | Zero extra services for local dev |
| Email | Nodemailer + Mailhog in Docker | Captured locally, no real sends |
| i18n | next-intl | Standard Next.js i18n solution |
| Testing | Vitest + @testing-library/react | Works without a browser, fast |
| ML | Python 3.11 + scikit-learn (optional Docker service) | Isolated, not required for app startup |
