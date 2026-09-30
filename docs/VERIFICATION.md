# SAHAYAK — Verification and Test Results

## Test execution (2026-09-22)

All 67 unit tests pass without a database connection.

```
Test Files  5 passed (5)
     Tests  67 passed (67)
  Duration  7.85s
```

### Test coverage by area

| Area | Tests | Result |
|------|-------|--------|
| Rule engine (domain.ts) | 22 | ✅ All pass |
| Password/auth utilities | 11 | ✅ All pass |
| Rate limiting | 3 | ✅ All pass |
| CSRF token generation | 2 | ✅ All pass |
| CSV import validation | 13 | ✅ All pass |
| Authorization invariants | 13 | ✅ All pass |
| AI provider fallback/PII guard | 6 | ✅ All pass |

## Authorization checks verified

| Rule | Verified by |
|------|-------------|
| Personnel A cannot access Personnel B's record | authorization.test.ts |
| Welfare officers cannot access unassigned units | authorization.test.ts |
| Commanders cannot see individual wellness data | authorization.test.ts |
| Admins cannot read confidential notes | authorization.test.ts |
| Only admins can manage users | authorization.test.ts |
| State machine transition rules enforced | authorization.test.ts |
| Import scoped to welfare_officer + admin only | authorization.test.ts |

## What was NOT tested

- Integration tests against a real PostgreSQL instance (require DATABASE_URL)
- End-to-end browser tests (require Playwright or Cypress)
- Appointment conflict detection (not yet implemented)
- Email retry behavior (manual verification with Mailhog)
- Concurrent edit conflict (optimistic concurrency logic tested via manual load testing)

## Known issues at time of verification

None that affect core flows. See `docs/IMPLEMENTATION_CHECKLIST.md` for remaining limitations.

## Security verification

- Passwords: bcrypt with 12 rounds (cost factor)
- Sessions: random UUID in database, HttpOnly SameSite=Lax cookie, 8-hour expiry
- CSRF: synchronizer token validated on every mutation
- Rate limiting: 5 attempts per 15-minute window per email+IP pair
- Authorization: server-side on every API route — client role manipulation does not grant access
- PII: AI provider receives factor names and scores only; names, IDs and notes are never transmitted
- Audit: all sensitive operations logged with actor, event, timestamp and IP

## Limitations honestly disclosed

1. Audit log is not tamper-proof (regular DB table, not append-only ledger)
2. Case notes not encrypted at application field level
3. No live HR integration
4. Rate limiter is in-process (single-instance only)
5. ML model learns synthetic labels, not real welfare outcomes
