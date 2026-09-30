# SAHAYAK — Professional Demo Walkthrough Script
# Live Prototype Demonstration Guide
# Estimated delivery time: 12–15 minutes
# Platform URL: http://localhost:3000

---

Good morning, respected judges.

Today, we are presenting **SAHAYAK**, an AI-powered personnel stress and welfare
support system designed to continuously monitor the wellbeing of Central Armed Police
Forces, Armed Forces, and other uniformed service personnel — and to connect them with
welfare officers, commanders, and administrative authorities in a structured, privacy-preserving
way.

The objective of SAHAYAK is straightforward: to identify occupational stress indicators
early, ensure timely welfare intervention, and create a connected support ecosystem
around every service member — while preserving individual privacy at every step.

Rather than describing the concept, let us walk you through the **live, functional prototype**
running on this machine. Every interaction you will see is connected to a real database,
authenticated sessions, and our AI integration layer.

*[Open browser → Navigate to http://localhost:3000]*

---

## 1. Landing Page and Authentication Architecture

*[Screen shows SAHAYAK landing page with logo, mission statement, and demo credentials panel]*

You can see the landing page here. At the top, the SAHAYAK logo and tagline:
"Personnel Wellbeing System — Welfare First. Human Always."

On the right side, you'll notice a demo credentials panel showing four available roles.
This panel is for demonstration purposes only — it would not exist in production
deployment.

Before I log in, let me briefly explain our authentication architecture, because security
is foundational to a system handling sensitive personnel data.

We use **bcrypt password hashing** with a cost factor of 12 — approximately 300
milliseconds per hash, making brute-force attacks computationally expensive.

After successful login, the server creates a server-side session and returns an
**HttpOnly, SameSite=Lax cookie**. This means the session token is never accessible
to JavaScript running in the browser, and the SameSite flag protects against
cross-site request forgery attacks.

Every data-modifying request — POST, PUT, DELETE — requires a **CSRF token** that
is generated at login and validated on the server.

We also enforce **rate limiting**: five failed login attempts from the same IP address
within fifteen minutes triggers a temporary account lock. Every login attempt — success
and failure — is recorded in the audit log with IP address, timestamp, and user ID.

Now, the system supports four roles:

- **Personnel** — the service member themselves
- **Welfare Officer** — assigned welfare support officers
- **Commander** — unit commanders with operational authority
- **Admin** — system administrators

The role is stored in the database and read by the server on every request. The client
cannot claim or override a different role. Middleware validates every protected route
and returns 401 or 403 for unauthorized access — not a redirect, which would reveal
the existence of the resource.

Let us begin by logging in as **Ravi Kumar**, a personnel member in Alpha Unit who
is currently showing an Elevated welfare indicator.

*[Click on "Ravi Kumar" in demo panel → auto-fills email and password → Click "Sign In"]*

---

## PART A — PERSONNEL JOURNEY

---

## 2. Personnel Dashboard — Profile and Current Status

*[After login, screen shows Personnel Dashboard]*

Excellent. We are now logged in as Ravi Kumar, a Constable in Alpha Unit.

Let me direct your attention to the top of this dashboard.

You can see his **profile header** showing:
- Full name: Ravi Kumar
- Rank: Constable
- Service number: CAP-0042
- Unit: Alpha Unit
- Current welfare priority badge: **Elevated** — shown in orange

Just below that, you see his **current welfare score**: 80 out of 143, classified as
Elevated priority. This score is derived from the same assessment engine that welfare
officers use. There is no separate calculation — complete transparency.

The dashboard also shows a quick summary: "3 check-ins this week · Trend: Worsening"

Notice that the sidebar on the left contains five sections:
- **Daily Check-in** — the core feature
- **Check-in Calendar** — monthly color-coded view
- **Workload & Recovery** — organizational duty visibility
- **Support Request** — private welfare request
- **Settings** — consent management

Let us start by submitting a daily check-in.

*[Click "Daily Check-in" in the sidebar]*

---

## 3. Daily Check-In Form — Data Collection

*[Screen shows the Daily Check-In form with seven input fields]*

This is the **Daily Check-In** form — the heart of SAHAYAK's continuous monitoring approach.

Currently, welfare assessments in uniformed services are conducted annually or
semi-annually through formal reviews. SAHAYAK changes that paradigm by enabling
daily voluntary self-reporting.

The form collects seven inputs:

1. **Mood** — scale of 1 to 5, where 1 is very low and 5 is excellent
2. **Sleep hours** — actual hours slept last night, decimal precision allowed
3. **Sleep quality** — scale of 1 to 5, subjective quality assessment
4. **Fatigue level** — scale of 1 to 10, combining physical and mental tiredness
5. **Perceived workload** — scale of 1 to 10, felt intensity of duty demands
6. **Optional concern note** — free text up to 500 characters, completely optional
7. **Support request checkbox** — "I would like to speak with a welfare officer"

All of these inputs are collected **only if the user has granted wellness consent**.
If Ravi had not consented to wellness data collection, this form would be hidden
entirely, and the system would assess him using only organizational data — duty
hours, night shifts, deployment status, and leave history.

Choosing not to share wellness data does not penalize anyone. The system never treats
silence as a risk signal.

Let me fill this in with today's values for Ravi.

*[Fill in the form:]*
- *Mood: 2 (low)*
- *Sleep hours: 3.5*
- *Sleep quality: 1 (poor)*
- *Fatigue: 9 (very high)*
- *Perceived workload: 8 (high)*
- *Concern note: "Struggling with concentration during duty after consecutive night shifts"*
- *Support request: Checked*

Notice that the system enforces **one check-in per calendar day per user**. This is
enforced at the database level with a unique constraint on user ID and date. If Ravi
tries to submit a second check-in today, the server returns a 409 Conflict with the
message: "Already checked in today."

Now let us submit this check-in.

*[Click "Submit Check-in" button]*

---

## 4. AI-Assisted Result Screen

After Ravi submits his check-in, the system immediately runs the **Welfare Assessment
Engine** and displays his result.

The result screen shows:

- His welfare score — for example, 80 out of 143 — and his priority: **Elevated**
- A breakdown of what was observed:
  - Reported factors: Fatigue 9 out of 10, Sleep 3.5 hours, Mood 2 out of 5
  - Organisational factors: 52 hours this week, 2 night shifts, 7 consecutive duty days, 42 days since last leave
- An **AI-generated summary** from Gemini 2.5-flash

The AI summary is personalized to Ravi's actual data. It might say something like:
*"Your reported fatigue and reduced sleep, combined with seven consecutive duty days
this week, suggest you may benefit from a structured recovery period. Your mood today
is notably lower than your 30-day average."*

The system also compares today's check-in with Ravi's previous check-ins and shows a
**trend comparison** — for example, sleep has dropped from an average of 6.2 hours,
and fatigue has risen from an average of 5.4.

Below the summary, the screen shows **suggested actions** with direct links:
- Request a recovery day, which links to the Workload module
- Speak with a welfare officer, which links to the Support Request
- View coping resources, which links to the resource page

An important design principle here: **no medical diagnosis is ever made**. The system
uses the word "pressured" or "fatigued" — not "stressed" or "at risk of breakdown."
The AI supports the welfare officer, not replaces the welfare officer.

If the AI API is unavailable — for example, if the key is not configured or the service
is temporarily down — the system automatically generates a **template-based summary**
using the same factor data. This fallback is clearly labeled on screen as
"Standard summary — AI unavailable." There is no silent degradation and no false
impression that Gemini was consulted when it was not.

---

## 5. Optional Follow-Up Questions

After the result screen, Ravi can optionally answer up to two follow-up questions
generated by the system.

For example: *"You reported high fatigue today — has this been affecting your
concentration during duty?"*

These questions are skippable at any time. Refusing to answer is never penalised and
does not affect the score. If Ravi does answer, the responses are stored and used to
refine the AI summary on a subsequent call.

---

## 6. Optional AI Conversation

Ravi can also open an **AI conversation drawer** to ask questions about his check-in
result.

This conversation is scoped strictly to the current check-in. The AI cannot recall
previous sessions, cannot access Ravi's personal details, and cannot be used for
general questions outside his welfare context. Prompt injection is mitigated by
enforcing system-prompt boundaries.

The conversation turns are stored in the database — but they are visible only to Ravi,
not to welfare officers and not to commanders.

---

## 7. Check-In Calendar

At the bottom of Ravi's dashboard is his **Check-In Calendar**.

This shows a monthly grid view with colour-coded dots for each day he has checked in:

- Green for Routine
- Yellow for Watch
- Orange for Elevated

Ravi can click on any day to see that day's summary. This builds self-awareness — he
can see whether his condition has been improving or deteriorating over the month.

This calendar is private. Commanders never see it. Only Ravi and his assigned welfare
officer can view it.

---

## 8. Workload and Recovery Visibility

SAHAYAK also shows Ravi his own **organisational duty data** — the same data being
used to assess him. This includes:

- His scheduled versus actual duty hours for the current week
- Number of consecutive duty days since his last rest day
- Number of night shifts in the last fourteen days
- Days since his last approved leave

If Ravi believes his recorded duty hours are wrong, he can submit a
**Duty Correction Request**. If he feels his workload has been unsustainable, he can
submit a **Workload Review Request**.

Duty Correction Requests go to the Welfare Officer queue. Workload Review Requests
go to the Commander queue — because those are operational concerns, not welfare concerns.

---

## 9. Support Request and Consent

At any time, regardless of his priority score, Ravi can submit a **Support Request** —
a private request to speak with his welfare officer.

There is no threshold. A person with a Routine score may still need private support.
The request is visible only to welfare officers. Commanders never see support request
counts or details. This is enforced at the API query level, not just hidden in the UI.

Ravi also has full control over three **consent toggles**:

- Wellness check-ins — whether mood, sleep, and fatigue data is stored at all
- AI processing — whether his data is sent to Gemini for personalized summaries
- Wearable integration — reserved for a future phase

He can withdraw any consent at any time. Withdrawal triggers an immediate
reassessment using only the remaining data. He is never penalised for exercising his
privacy rights.

---

## Welfare Officer Journey

---

## 10. Case Priority Queue

Now let us look at the platform from the perspective of the **Welfare Officer**.

After logging in, the officer lands on the **Case Priority Queue** — a list of all
personnel in their assigned unit, sorted by welfare priority.

The list is divided into three groups:
- **Elevated** — at the top, flagged in orange
- **Watch** — in the middle, flagged in yellow
- **Routine** — below, in green

For each person, the officer can see their name, rank, current score, last check-in date,
days since the last officer review, and whether a support request is pending.

Crucially, this list is **unit-scoped**. The server filters every query by the officer's
assigned unit ID. There is no UI option to switch to another unit without a separate
account. This is enforced on the server, not just visually hidden.

---

## 11. Individual Case Detail

When the officer opens Ravi Kumar's case, they see a full breakdown of his current
welfare score.

This includes a **point-by-point factor breakdown**:

- Weekly duty hours: 52 hours against a threshold of 48 — contributing 12 points
- Night shifts: 2 in the last 14 days — contributing 8 points
- Consecutive duty days: 7 against a threshold of 6 — contributing 15 points
- Days since leave: 42 days against a threshold of 30 — contributing 10 points
- Fatigue: 9 out of 10, very high band — contributing 15 points
- Sleep hours: 3.5 hours, very low band — contributing 15 points
- Sleep quality: 1 out of 5 — contributing 5 points

The officer can see exactly which factors are driving the score. There is no black box.
Every point is explained.

Below the factor breakdown, the officer sees the AI explanation — labeled clearly as
generated by Gemini 2.5-flash or by the template fallback — and a 30-day trend
sparkline showing how Ravi's score has changed over the past month.

---

## 12. Recording Interventions

The officer can record one of several **intervention types**:

- A welfare conversation — informal check-in, date and summary recorded
- A counsellor referral — name, organisation, and date logged
- A leave recommendation — proposed leave dates sent to the Commander workload module
- A duty adjustment proposal — proposed schedule change flagged to the Commander
- A recovery planning note — structured recovery protocol with a timeline
- A medical referral — category only, no clinical diagnosis

Every intervention record requires a follow-up date for non-trivial interventions. The
officer's ID, intervention type, and timestamp are logged in the audit trail — but the
content of the conversation is never in the audit log.

---

## 13. Case State Machine

Every welfare case follows a defined **state machine**:

New → Reviewed → Contacted → Intervention Agreed → Follow-up → Closed

No backward transitions are permitted without an admin override. Dismissal requires a
mandatory reason of at least twenty characters. If a case stays in the Reviewed state
for more than 72 hours without action, it is automatically flagged red in the queue.

Every state change is logged with the officer ID, the previous state, the new state,
and a timestamp.

---

## 14. CSV Import of Organisational Data

The welfare officer can also **import organisational records** via CSV. There are five
supported import types:

- Duty schedules — recording scheduled and actual hours per person per day
- Deployment records — with start and end dates
- Leave records — approved leave with status
- Transfer history — tracking inter-unit movements
- Training schedules — training commitments

The import workflow is: upload → server preview → officer reviews first ten rows →
confirms → records committed → **post-import reassessment triggered automatically
for all affected personnel**.

The officer sees a confirmation message such as: "Reassessed 12 personnel affected
by this import." Exact duplicate records are rejected with a warning. Near-duplicate
overlapping records are flagged for review.

---

## Commander Journey

---

## 15. Commander Dashboard — Aggregates Only

Now let us look at the platform from the perspective of the **Commander**.

This is a fundamentally different view from the welfare officer's. The Commander has
**no access to individual wellness data** — ever. This is not simply a UI choice. The
server queries return aggregated counts only. Even if a commander directly calls the
API with their session cookie, the server enforces this at the query level and returns a
403 for any individual wellness data request.

The commander's dashboard shows:

- Counts only: how many personnel in the unit are Elevated, Watch, or Routine
- A 30-day aggregate trend — is the unit's overall welfare position improving or worsening?
- Week-over-week change: for example, "4 more personnel moved to Watch this week"

There is also a **minimum group size suppression**. If a unit has fewer than ten
personnel, no aggregate data is shown at all. This prevents a commander from
reverse-engineering an individual's wellness from a very small group. The suppression
threshold is configurable by the admin.

---

## 16. Workload Distribution View

With explicit **Duty Manager Access** granted, the commander can see per-person
organisational duty metrics — not wellness metrics. This includes:

- Scheduled versus actual duty hours
- Night shift count per person in the last 14 days
- Consecutive duty days per person
- Days since last approved leave

Policy warning flags are shown:
- Yellow for warnings — for example, six or more consecutive days, or 48 or more hours per week
- Red for blocking violations — for example, ten or more consecutive days, or 60 or more hours per week

---

## 17. Scenario Planner

The commander can use the **Scenario Planner** to model the impact of reducing
workload on the unit's welfare indicators.

They input two parameters:
- How many night shifts to reduce per fortnight
- How many hours per week to reduce

The system recalculates the organisational welfare factors for each person under the
proposed scenario and shows a before and after comparison:

- Before: Average unit organisational score: 62 out of 103
- After: Average unit organisational score: 41 out of 103
- Estimated number of personnel moving off Elevated: 4

Three honest disclaimers are displayed on screen:
*"Estimates are based on organisational factors only. Wellness indicators such as
sleep, fatigue, and mood are not included — those depend on the individual."*
*"This is a planning tool, not a medical prediction."*
*"Actual outcomes depend on implementation and individual recovery."*

---

## 18. Rebalancing Planner and Feasibility Check

When the commander creates a new duty assignment through the **Rebalancing Planner**,
the system runs a **pre-assignment capacity check** before committing any change.

There are four levels of findings:

- **Blocking** — cannot proceed under any circumstances. This includes leave conflicts,
  duty overlaps, recovery gaps of less than eight hours, and ten or more consecutive days.
- **Warning** — can override but requires a stated reason. Triggered by recovery gaps
  under ten hours, six or more consecutive days, or weekly hours above 48.
- **Informational** — advisory only
- **Insufficient data** — the relevant policy has not been configured yet

If a proposed schedule cannot be achieved with available personnel, the system
returns an honest infeasibility message — for example: *"Cannot fulfill coverage:
3 slots uncovered after applying all constraints. Add 3 more available personnel or
reduce coverage requirements."*

The system never silently relaxes constraints to make a plan appear feasible. It never
invents available staff. Constraints are always honoured.

The rebalancing plan follows an approval workflow:
Draft → Submitted for Review → Reviewed by Welfare Officer → Approved by Commander → Applied

---

## Admin Journey

---

## 19. Admin Panel

Let us now look briefly at the **Admin Panel**.

The admin manages structure, not content. They have full system-level control but
cannot read welfare case notes, AI analysis summaries, check-in answers, or any
individual content.

Through the admin panel, they can:

- Create user accounts, assign roles and units, disable accounts with immediate session
  invalidation, and reset passwords
- Create and configure units — including the minimum group size for data suppression
- Configure workload policy thresholds — the warning and blocking limits for duty hours,
  consecutive days, night shifts, and recovery gaps. These are labeled as demonstration
  defaults, not legal standards
- Manage welfare scoring rule versions — activating a new version preserves all historical
  assessments; new assessments use the currently active version
- View the **audit log** — every login attempt, consent change, case access, intervention
  recording, AI analysis request, CSV import, and account modification is logged with
  timestamps and IDs

The audit log answers the question: who accessed what, and when. It does not contain
the content of what was said.

---

## Intelligence and Decision Layer

---

## 20. Welfare Assessment Engine — RULES_V1

Behind every check-in submission, the **Welfare Assessment Engine** runs automatically.

It collects data from multiple sources:

- Duty records — weekly hours, scheduled versus actual
- Night duty records — night shifts in the last fourteen days
- Deployment records — current deployment status and duration
- Leave records — days since last approved leave
- Transfer history — transfers in the last twelve months
- Training records — committed training days
- And the day's check-in wellness data — only if wellness consent has been granted

It then applies **RULES_V1** — a versioned, deterministic rule engine with ten
scoring factors:

Six organisational factors:
1. Weekly duty hours — up to 20 points
2. Night shift frequency — up to 15 points
3. Consecutive duty days — up to 15 points
4. Leave deprivation — up to 15 points
5. Recent transfers — up to 8 points
6. Active deployment — up to 10 points

Four wellness factors — only scored if wellness consent is granted:
7. Fatigue — up to 15 points
8. Sleep hours — up to 15 points
9. Sleep quality — up to 10 points
10. Mood — up to 5 points

The maximum possible score with only organisational data is **103 points**.
With full wellness data, it is **143 points**.

The score is always shown as rawScore out of maxPossibleScore — never out of 100,
never as a percentage. This makes the denominator honest about what data was included.

Based on the total score, the personnel member is assigned a priority level:
- **Routine** — 0 to 24 points
- **Watch** — 25 to 54 points
- **Elevated** — 55 points or above

The engine is fully deterministic. The same inputs always produce the same output.
There is no randomness and no black box.

Missing wellness data contributes zero points. The system never penalises a person
for not sharing. Silence is not treated as a risk signal.

---

## 21. AI Insight Engine — Gemini 2.5-flash

The AI layer sits on top of the assessment engine and generates **personalized, readable
summaries** of the check-in result.

We use **Google Gemini 2.5-flash** through the v1beta API.

Before calling Gemini, the system **anonymises the payload completely**. The following
are never sent to Gemini:

- Name, rank, or service number
- Unit name or location
- Personnel ID or check-in ID
- Any free-text concern note written by the person
- Previous case notes or intervention records

Only anonymised factor scores and threshold labels are sent — for example, fatigue at
the very high band, sleep hours at the very low band, seven consecutive duty days.

If the Gemini API is unavailable for any reason — network timeout, missing key, server
error — the system falls back to a **template engine** that generates a rule-based
summary from the same factor data. This fallback is clearly labeled. The `source` field
in every API response is either `"gemini"` or `"template"` — there is never any ambiguity.

---

## 22. Workload Capacity Engine

Separate from the welfare assessment, SAHAYAK includes a **Workload Capacity Engine**
that answers a different question: can this person be assigned this duty without violating
policy?

Before any new duty assignment is committed, the engine checks:

- Is the person on approved leave? — Blocking if yes
- Does this duty overlap with an existing assignment? — Blocking if yes
- Is the recovery gap from the previous duty less than eight hours? — Blocking
- Is the recovery gap less than ten hours? — Warning, override requires a reason
- Would this create ten or more consecutive duty days? — Blocking
- Would this create six or more consecutive days? — Warning
- Would weekly hours exceed sixty? — Blocking
- Would weekly hours exceed forty-eight? — Warning

Every finding is typed: blocking, warning, informational, or insufficient data. The engine
returns honest infeasibility when a schedule cannot be achieved. It never adjusts
thresholds silently and never creates availability where none exists.

---

## 23. Data Flow Summary

To summarise the data flow:

When Ravi Kumar submits a check-in, the server stores the record, runs the assessment
engine against all available organisational and wellness data, optionally calls Gemini
with an anonymised payload, stores the analysis, and returns the result to Ravi's screen.

If his priority is Elevated, a welfare case is created or updated automatically. His
welfare officer receives an in-app notification scoped to their unit. The commander
receives only an updated aggregate count — no name, no score, no detail.

Every action taken by the welfare officer — viewing the case, recording an intervention,
advancing the state — is logged in the audit trail with the officer's ID and a timestamp,
but without the content of what was discussed.

---

## 24. Tech Stack

SAHAYAK is built on the following stack:

- **Next.js 15** with the App Router — for the UI, server-side rendering, and API routes
- **TypeScript** across the full stack — for type safety from the database to the browser
- **Drizzle ORM** — for type-safe database queries and schema-first migrations
- **PGlite** in development — a WASM-based PostgreSQL that requires zero installation
  and persists to a local folder. In production, this is replaced by PostgreSQL 16.
- **Gemini 2.5-flash** — for personalized AI summaries
- **bcrypt and HttpOnly sessions** — for authentication, with no third-party dependencies
- **Vitest** — for automated testing

The system currently has **200 automated tests across eight test files**, covering
authentication, welfare scoring, role-based authorization, workload capacity checks,
the check-in journey, CSV import logic, and AI provider behavior. All 200 tests pass.

---

## 25. Future Development

What we have demonstrated today is the functional prototype of SAHAYAK.

In the next phase, we plan to strengthen the platform through several enhancements.

First, we plan to introduce **wearable device integration** — connecting smartwatches
and fitness trackers to automatically capture sleep and activity data, reducing manual
input burden while maintaining the same consent model.

Second, we plan to add **Hindi and regional language support** for the check-in form
and AI summaries, so that personnel can interact in their preferred language.

Third, we plan to build an **offline-capable mobile application** for field deployments
where connectivity is limited. Essential functions such as check-ins and support requests
will work locally and sync to the central system when connectivity is restored.

Fourth, we plan to build a **predictive trend engine** — identifying patterns across the
unit over weeks and months to flag early deterioration before it reaches the Elevated
threshold. This would use only organisational data and aggregated wellness trends, never
individual records, in order to maintain the same privacy guarantees.

---

## Conclusion

SAHAYAK is not simply a wellness survey tool.

It is a connected personnel welfare decision-support system that brings together the
service member, the welfare officer, the commander, and the administration — each
seeing only what they are authorised to see, and acting only within the boundaries of
their responsibility.

Through daily voluntary check-ins, organisational data integration, explainable welfare
scoring, AI-assisted personalised summaries, and a workload capacity engine, SAHAYAK
aims to surface occupational stress indicators earlier and enable welfare support to
reach the right person at the right time.

Our vision is straightforward:

**No warning sign should go unrecorded. No service member under pressure should wait
for an annual review. And no one should be penalised for asking for support.**

Thank you.

---

## Quick Reference — Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Personnel (Elevated) | ravi.kumar@sahayak.local | Demo@1234 |
| Welfare Officer | welfare.officer@sahayak.local | Demo@1234 |
| Commander | commander@sahayak.local | Demo@1234 |
| Admin | admin@sahayak.local | **Admin@1234** |

Live at: **http://localhost:3000**
- *Support request: Checked*

Notice that the system enforces **one check-in per calendar day per user**. This is
enforced at the database level with a unique constraint on user ID and date. If Ravi
tries to submit a second check-in today, the server returns a 409 Conflict with the
message: "Already checked in today."

Now let us submit this check-in.

*[Click "Submit Check-in" button]*

---

## 4. AI-Assisted Result Screen — Welfare Assessment

*[After a brief loading state, the result screen appears]*

Excellent. The check-in has been processed and the **Welfare Assessment Engine** has
run in real-time.

Let me walk you through what you're seeing on this result screen.

At the top: **Today's Welfare Score: 80 / 143** — Priority: **ELEVATED**

The score is always shown as a fraction. The numerator is the raw score computed from
all available factors. The denominator — 143 in this case — represents the maximum
possible score given the data Ravi has consented to share.

If Ravi had not granted wellness consent, the denominator would be 103, representing
only the six organizational factors. This honest denominator makes it clear what data
was included in the assessment.

Below the score, you see two sections:

### What We Observed

**Reported factors:**
- Fatigue: 9 out of 10 — contributing 15 points
- Sleep: 3.5 hours — contributing 15 points (very low band, under 4 hours)
- Sleep quality: 1 out of 5 — contributing 5 points
- Mood: 2 out of 5 — contributing 3 points

**Organizational factors:**
- Weekly duty hours: 52 hours (threshold: 48) — contributing 12 points
- Night shifts last 14 days: 2 — contributing 8 points
- Consecutive duty days: 7 (threshold: 6) — contributing 15 points
- Days since last approved leave: 42 (threshold: 30) — contributing 10 points

Every point is accounted for. There is no black box.

### AI Summary

Now, look at the AI summary section.

*[Point to AI summary text on screen]*

This summary was generated by **Google Gemini 2.5-flash** through the v1beta API.

Before calling Gemini, our system **anonymizes the payload completely**. The following
are never sent to the AI:

- Ravi's name, rank, or service number
- His unit name or location
- His personnel ID or check-in ID
- The free-text concern note he wrote
- Any previous case notes or intervention records

Only anonymized factor scores and threshold labels are sent — for example, "fatigue at
very high band," "sleep hours at very low band," "seven consecutive duty days."

The AI returns a 3-4 sentence personalized summary explaining what the data suggests.
You can see it uses supportive, non-alarmist language and avoids clinical terms like
"stressed" or "at risk of breakdown."

Importantly, if the Gemini API were unavailable — for example, if the API key were not
configured or the service were temporarily down — the system would automatically fall
back to a **template-based summary** engine that generates a rule-based explanation
from the same factor data.

This fallback would be clearly labeled on screen as: **"[Standard summary — AI unavailable]"**

The `source` field in every analysis response is either `"gemini"` or `"template"` —
there is never any ambiguity about which was used.

### Trend Comparison

*[Point to trend section]*

Below the AI summary, you see a **trend comparison** section.

This compares Ravi's check-in today with his 30-day average:

- Sleep: down from 6.2 hours average
- Fatigue: up from 5.4 average
- Score: up 18 points this week — meaning his condition has worsened

Trend data is only shown if Ravi has completed at least two previous check-ins. The
system never fabricates trends from insufficient data.

### Suggested Actions

At the bottom, you see three **suggested actions** with working links:

- Request a recovery day → links to the Workload module
- Speak with welfare officer → links to Support Request
- View coping resources → links to the Resources page

These are not generic suggestions. They are contextually relevant to the elevated
organizational and wellness factors we just observed.

*[Scroll down slightly]*

---

## 5. Optional Follow-Up Questions and AI Conversation

*[Point to optional follow-up section at bottom of result screen]*

Below the suggested actions, you see two optional features:

### Follow-Up Questions

The system can generate up to **two follow-up questions** based on the check-in content.
For example: *"You reported high fatigue — has this been affecting your concentration
during duty?"*

These questions are entirely skippable. Ravi can click "Skip" at any time. Refusal
to answer is never penalized and does not affect the score.

If he does answer, the responses are stored and used to refine the AI summary on a
subsequent analysis request.

### AI Conversation

Ravi can also click **"Continue AI conversation"** to open a scoped chat interface.

*[Click to open the conversation drawer]*

This conversation is **strictly scoped to this check-in**. The AI cannot recall previous
sessions, cannot access other personnel's data, and cannot be used for unrelated queries.

Prompt injection is mitigated by enforcing system-prompt boundaries on the server.

The conversation turns are stored in the `checkin_conversations` table in the database,
but they are visible only to Ravi — not to welfare officers and not to commanders.

*[Close the conversation drawer]*

Let us now move to the next feature.

*[Click "Check-in Calendar" in the sidebar]*

---

## 6. Check-In Calendar — Monthly Trend View

*[Screen shows a monthly calendar grid with color-coded dots]*

This is Ravi's **Check-In Calendar** — a monthly grid view showing every day he has
completed a check-in.

Each day is marked with a color-coded dot:
- **Green** for Routine priority (0–24 points)
- **Yellow** for Watch priority (25–54 points)
- **Orange** for Elevated priority (55+ points)

If you look at this month, you can see a pattern: mostly green and yellow in the first
two weeks, transitioning to orange in the third week. This visual trend helps Ravi
understand whether his condition has been improving or deteriorating over time.

He can click on any day to see that day's full check-in summary.

This calendar is **private**. Commanders never see it. Only Ravi and his assigned
welfare officer have access.

The calendar data is retrieved through a dedicated API endpoint:
`GET /api/personnel/checkin/month?year=2026&month=9`

which returns an array of check-ins with date, score, priority, and a flag indicating
whether an AI analysis exists for that check-in.

*[Click "Workload & Recovery" in the sidebar]*

---

## 7. Workload and Recovery Visibility

*[Screen shows organizational duty data]*

This section shows Ravi his **organizational duty data** — the same data being used
to assess his welfare score.

He can see:

- His **scheduled versus actual duty hours** for the current week
  - Scheduled: 48 hours
  - Actual: 52 hours — 4 hours over schedule
- **Consecutive duty days**: 7 days since his last rest day
- **Night shifts in the last 14 days**: 2
- **Days since last approved leave**: 42 days

This transparency is important. Ravi can verify that the data being used to assess
him is accurate.

If he believes his recorded duty hours are incorrect, he can submit a
**Duty Correction Request**:

*[Point to "Submit Correction" button]*

*"I worked 58 hours this week but only 48 hours are recorded."*

If he feels his workload has been operationally unsustainable, he can submit a
**Workload Review Request**:

*[Point to "Request Review" button]*

*"I have completed 9 consecutive days without a rest day — requesting rotation."*

These two request types are routed differently:

- **Duty Correction Requests** → Welfare Officer queue (data accuracy issue)
- **Workload Review Requests** → Commander queue (operational concern)

This distinction ensures the right person receives the right type of request.

*[Click "Support Request" in the sidebar]*

---

## 8. Support Request and Privacy Guarantee

*[Screen shows Support Request page]*

At any time, regardless of his priority score, Ravi can submit a **Support Request** —
a private, confidential request to speak with his assigned welfare officer.

There is **no threshold**. Even a person with a Routine score may need private support.

When Ravi submits this request:

1. A welfare case record is created in the `welfare_cases` table with status "new"
2. The assigned welfare officer receives an **in-app notification** scoped to their unit
3. The commander receives **no notification** — this is enforced at the API query level

Let me emphasize this privacy guarantee: support requests are visible **only** to
welfare officers assigned to Ravi's unit. The commander's aggregate dashboard does not
show support request counts or details. Even if a commander were to call the API
directly with their session cookie, the server would return a 403 Forbidden response.

This is not a UI-level hiding. This is server-enforced authorization.

*[Click "Settings" → "Consent Management" in the sidebar]*

---

## 9. Consent Management — User Control

*[Screen shows three consent toggle switches]*

This is the **Consent Management** page, where Ravi has full control over three types
of data sharing:

### 1. Wellness Check-Ins
Controls whether mood, sleep, fatigue, and workload data are stored at all.
- **Default**: Granted on signup
- **If withdrawn**: Check-in form is hidden; assessment uses organizational data only

### 2. AI Processing
Controls whether check-in data is sent to Google Gemini for personalized summaries.
- **Default**: Not granted — user must opt in
- **If withdrawn**: System uses template fallback; clearly labeled on result screen

### 3. Wearable Integration
Reserved for future phase — smartwatch and fitness tracker data.
- **Default**: Not yet available
- **When implemented**: User must explicitly grant before any device data is collected

Ravi can withdraw any consent at any time with a single click. There is no confirmation
dialog, no friction — immediate effect.

When consent is withdrawn:
- An immediate reassessment is triggered using only the remaining consented data
- The score denominator changes to reflect the new maximum possible score
- Historical check-ins are preserved but future check-ins exclude the withdrawn data type

Crucially, **choosing not to share wellness data does not penalize Ravi in any way**.
The system never treats silence as a risk signal.

If Ravi withdraws wellness consent, his score would be shown as, for example, 45 out
of 103 — not 45 out of 143. The denominator is honest about what data was included.

---

This concludes the Personnel journey. Now let us log out and log in as a **Welfare Officer**
to see how the system supports welfare case management.

*[Click profile menu → "Logout"]*

---

## PART B — WELFARE OFFICER JOURNEY

---

## 10. Welfare Officer Login and Case Priority Queue

*[Back on landing page → Click "Welfare Officer" in demo panel → Login]*

We are now logged in as a welfare officer assigned to Alpha Unit.

*[Screen shows Welfare Officer dashboard with Case Priority Queue]*

This is the **Case Priority Queue** — a list of all personnel in this officer's assigned
unit, sorted by welfare priority.

Notice the list is divided into three collapsible groups:

- **Elevated (3 personnel)** — shown at the top with orange badges
- **Watch (8 personnel)** — in the middle with yellow badges
- **Routine (25 personnel)** — below with green badges

For each person in the list, the officer can see:
- Name and rank
- Current score — displayed as rawScore / maxPossibleScore
- Last check-in date
- Days since the last officer review
- A **support request badge** if the person has requested private welfare support
- An **overdue follow-up flag** in red if a scheduled follow-up date has passed

Crucially, this list is **unit-scoped**. The server filters every query by the officer's
assigned `unitId`. There is no UI option to "switch units" without logging in with a
different account.

Let us open Ravi Kumar's case.

*[Click on "Ravi Kumar" in the Elevated group]*

---

## 11. Individual Case Detail — Factor Breakdown

*[Screen shows detailed case view for Ravi Kumar]*

This is the full case detail view for Ravi Kumar.

At the top, you see:
- Name: Ravi Kumar
- Rank: Constable
- Service number: CAP-0042
- Current score: **80 / 143**
- Priority: **ELEVATED**

Below that, you see the **factor breakdown** — a point-by-point accounting of how
the score was calculated.

### Organizational Factors (from duty records)
- Weekly duty hours: 52h (threshold 48h) → **12 points**
- Night shifts last 14 days: 2 → **8 points**
- Consecutive duty days: 7 (threshold 6) → **15 points**
- Days since leave: 42 (threshold 30) → **10 points**

### Wellness Factors (from check-in — consent granted)
- Fatigue: 9/10 (very high band) → **15 points**
- Sleep hours: 3.5h (very low band, <4h) → **15 points**
- Sleep quality: 1/5 (poor) → **5 points**
- Mood: 2/5 (low) → **3 points**

**Total: 83 points out of 143**

Every point is explained. The officer can see exactly which factors are driving the
Elevated classification.

### AI Explanation

*[Point to AI explanation section]*

Below the factor breakdown, the officer sees the **AI explanation** — the same
Gemini-generated summary that Ravi saw on his result screen, clearly labeled:

**[Source: Gemini 2.5-flash]**

If this were a template fallback, it would be labeled:
**[Source: Standard template — AI unavailable]**

The label is always present. There is no ambiguity.

### Historical Trend

*[Point to sparkline graph]*

Below the AI explanation, you see a **30-day trend sparkline** showing how Ravi's
score has changed over the past month.

You can also see summary statistics:
- Assessments: 12
- Interventions recorded: 1
- Follow-ups scheduled: 2

This longitudinal view helps the officer understand whether Ravi's condition is a
sudden spike or part of a worsening trend.

### Case Status

*[Point to case status section at bottom]*

At the bottom, you see the current **case status**: Reviewed

The officer can advance the case through the state machine by selecting the next state
from a dropdown.

Let us record an intervention.

*[Click "Record Intervention" button]*

---

## 12. Recording Interventions

*[Modal dialog opens showing intervention form]*

This form allows the welfare officer to record one of several **intervention types**:

1. **Welfare conversation** — informal check-in chat; date and summary recorded
2. **Counsellor referral** — external professional referral; name, org, and date logged
3. **Leave recommendation** — proposed leave dates sent to Commander for approval
4. **Duty adjustment proposal** — proposed schedule change flagged to Commander workload module
5. **Recovery planning** — structured recovery protocol with timeline and milestones
6. **Medical referral** — referred to medical officer; category only, no clinical diagnosis

Let me fill in a welfare conversation intervention:

*[Fill in form:]*
- *Type: Welfare conversation*
- *Date: Today*
- *Summary: "Discussed fatigue and consecutive duty concerns. Recommended 2-day recovery period. Advised on sleep hygiene practices. Will follow up in 5 days."*
- *Follow-up date: 5 days from now*
- *Status: Completed*

*[Click "Save Intervention"]*

Every intervention record is stored with:
- Welfare officer ID (not name — just ID in the audit log)
- Intervention type
- Follow-up date (mandatory for non-trivial interventions)
- Timestamp

The **content** of the intervention note is never logged in the audit trail. The audit
log records only that an intervention was recorded — not what was said.

*[Close modal]*

Now let us advance the case state.

*[Select "Contacted" from the state dropdown → Click "Update Status"]*

---

## 13. Case State Machine

*[Screen updates; case status now shows "Contacted"]*

The case has moved from **Reviewed** to **Contacted**.

Every welfare case follows a defined **state machine**:

```
New → Reviewed → Contacted → Intervention Agreed → Follow-up → Closed
         ↓
     Dismissed (requires mandatory reason)
```

The rules are:

- **No backward transitions** are permitted without an admin override. You cannot move
  a case from Closed back to New without elevated privileges.
- **Dismissal requires a reason** — minimum 20 characters explaining why the case is
  being dismissed without full intervention.
- **Auto-flagging**: If a case remains in the Reviewed state for more than 72 hours
  without action, it is automatically flagged red in the priority queue.

Every state transition is logged in the audit trail with:
- Officer ID
- Previous state
- New state
- Timestamp

This creates **accountability**. If a high-priority case is dismissed or left unattended,
there is a clear audit trail.

Now let us look at CSV import functionality.

*[Click "Import Data" in the top navigation]*

---

## 14. CSV Import — Organizational Data Ingestion

*[Screen shows CSV import page with five import type options]*

The welfare officer can import **organizational records** via CSV. There are five
supported import types:

1. **Duty schedules** — personnelId, date, scheduledHours, actualHours
2. **Deployment records** — personnelId, startDate, endDate, location
3. **Leave records** — personnelId, startDate, endDate, leaveType, status
4. **Transfer history** — personnelId, fromUnit, toUnit, transferDate
5. **Training schedules** — personnelId, startDate, endDate, trainingType

Let me demonstrate with a duty schedule import.

*[Select "Duty Schedule" → Click "Upload CSV" → Select a sample file]*

*[Screen shows preview with first 10 rows]*

After upload, the system shows a **preview** of the first 10 rows and a validation report:

- Missing required columns: None
- Invalid date formats: None
- Exact duplicate records: 2 (flagged with warning)
- Near-duplicate overlapping records: 0

The officer reviews the preview and decides whether to proceed.

*[Click "Confirm Import"]*

*[Progress indicator → Success message appears]*

**"Import complete. 48 records committed. Reassessed 12 personnel affected by this import."**

This last line is critical: **post-import reassessment is triggered automatically** for
all personnel whose duty, leave, deployment, transfer, or training records were affected
by the import.

This ensures that the welfare scores always reflect the most current organizational data.

---

This concludes the Welfare Officer journey. Now let us log out and log in as a **Commander**
to see the aggregate-only view.

*[Click profile menu → "Logout"]*

---

## PART C — COMMANDER JOURNEY

---

## 15. Commander Login and Aggregate Dashboard

*[Back on landing page → Click "Commander" in demo panel → Login]*

We are now logged in as the Commander of Alpha Unit.

*[Screen shows Commander dashboard with aggregate statistics]*

This dashboard is fundamentally different from the welfare officer's view.

The Commander has **no access to individual wellness data** — ever.

What you see on this screen are **aggregate counts only**:

- **Elevated**: 3 personnel
- **Watch**: 8 personnel
- **Routine**: 25 personnel

Below that, a 30-day trend line showing the unit's overall welfare trajectory:
*"Unit aggregate score has increased by 8% this month (worsening)"*

And a week-over-week delta:
*"4 more personnel moved to Watch priority this week"*

**What is NOT shown:**
- Individual names or scores
- Individual check-in history
- Support request details
- AI analysis summaries

This is not a UI-level hiding. If a commander were to directly call the API endpoint
`/api/welfare/cases` with their session cookie, the server would return a **403 Forbidden**
response. The authorization is enforced at the query level in the database.

There is also a **minimum group size suppression** rule: if a unit has fewer than 10
personnel, no aggregate data is shown at all. This prevents reverse-engineering an
individual's wellness from very small groups.

The suppression threshold (default 10) is configurable by the admin on a per-unit basis.

Now let us look at the Workload Distribution view — but note that this requires explicit
**Duty Manager Access**.

*[Click "Workload Distribution" in the sidebar]*

---

## 16. Workload Distribution — Organizational Metrics Only

*[Screen shows per-person duty metrics]*

With **Duty Manager Access** granted, the commander can see per-person **organizational
duty metrics** — not wellness metrics.

This table shows:

| Name | Rank | Duty Hours (Week) | Night Shifts (14d) | Consecutive Days | Days Since Leave |
|------|------|------------------|-------------------|------------------|------------------|
| Ravi Kumar | Constable | **52h** ⚠️ | 2 | **7** ⚠️ | 42 |
| Amit Singh | Constable | 48h | 1 | 5 | 28 |
| Priya Sharma | Sub-Inspector | 44h | 0 | 4 | 35 |
| ... | ... | ... | ... | ... | ... |

Notice the warning flags:

- **Yellow (⚠️)** for warnings:
  - Weekly hours ≥ 48h
  - Consecutive days ≥ 6
  - Night shifts ≥ 3 in 14 days
  - Recovery gap < 10h between duties

- **Red (🔴)** for blocking violations:
  - Weekly hours ≥ 60h
  - Consecutive days ≥ 10
  - Recovery gap < 8h between duties

These flags are based on **configurable policy thresholds** set by the admin. They are
labeled as demonstration defaults, not legal standards.

Crucially, this view shows only organizational data — duty hours, night shifts,
consecutive days, leave gaps. It does **not** show mood, sleep, fatigue, or any
wellness self-reporting.

*[Click "Scenario Planner" in the sidebar]*

---

## 17. Scenario Planner — Impact Modeling

*[Screen shows scenario planning interface with two sliders]*

The **Scenario Planner** allows the commander to model the welfare impact of
reducing workload on the unit.

There are two input parameters:

1. **Night shift reduction** — slider from 0 to 6 per fortnight
2. **Weekly hour reduction** — slider from 0 to 16 hours

Let me set these to:
- Night shifts: reduce by 2 per fortnight
- Weekly hours: reduce by 8 hours per week

*[Adjust sliders → Click "Calculate Impact"]*

*[Screen updates with before/after comparison]*

**Before:**
- Average unit organizational score: 62 / 103
- Personnel in Elevated (org factors only): 5

**After (estimated):**
- Average unit organizational score: 41 / 103
- Personnel in Elevated (org factors only): 2
- Estimated movement: 3 personnel move from Elevated to Watch

Below the results, three **honest disclaimers** are displayed prominently:

1. *"Estimates are based on organizational factors only. Wellness indicators such as
   sleep, fatigue, and mood are not included — those depend on the individual."*

2. *"This is a planning tool, not a medical prediction. Actual welfare outcomes depend
   on implementation quality and individual recovery capacity."*

3. *"Reducing duty hours does not automatically improve wellness if other stressors remain."*

These disclaimers prevent misuse of the scenario planner as a predictive medical tool.

*[Click "Rebalancing Planner" in the sidebar]*

---

## 18. Rebalancing Planner and Feasibility Engine

*[Screen shows duty rebalancing interface]*

The **Rebalancing Planner** allows the commander to create new duty assignments or
modify existing schedules — but with **automatic feasibility checking** before anything
is committed.

Let me try to assign Ravi Kumar to an additional night shift tomorrow.

*[Select "Ravi Kumar" from dropdown → Select "Night Shift" → Set date to tomorrow → Click "Check Feasibility"]*

*[System runs pre-assignment capacity check → Results appear]*

**Capacity Check Results:**

🔴 **BLOCKING** findings (cannot proceed):
- Consecutive days would reach **8 days** (blocking threshold: 10 days) — currently at 7
- Recovery gap from previous duty: **6 hours** (blocking threshold: 8 hours)

⚠️ **WARNING** findings (can override with reason):
- Weekly hours would reach **60 hours** (warning threshold: 48 hours)

The system returns an **honest infeasibility** result. This assignment cannot be made
without violating two blocking constraints.

The system will **never silently relax constraints** to make an assignment appear feasible.
It will **never invent available personnel** who do not exist.

If the commander insists on this assignment, they would need to either:
- Wait for Ravi to complete a rest day (resolving consecutive days)
- Adjust the shift start time (resolving recovery gap)
- Override only the warning-level findings with a stated reason

Let me cancel this and try a different scenario.

*[Click "Cancel"]*

Now let me try creating a rebalancing plan that redistributes night shifts across the
unit to reduce Ravi's consecutive duty load.

*[Click "Create New Plan" → Name: "September Night Shift Rebalancing" → Add multiple assignments redistributing load]*

*[Click "Submit for Review"]*

The rebalancing plan now enters an **approval workflow**:

```
Draft (editable, not visible to others)
   ↓
Submitted for Review (locked, sent to Welfare Officer)
   ↓
Reviewed (Welfare Officer notes any welfare concerns — not blocking)
   ↓
Approved (Commander confirms after welfare review)
   ↓
Applied (DB updated, duty ledger reflects new schedule, affected personnel notified)
```

This workflow ensures that rebalancing decisions consider both operational requirements
(Commander) and welfare impacts (Welfare Officer) before being applied.

*[Navigate to "Workload Requests" in the sidebar]*

---

## 19. Workload Review Requests from Personnel

*[Screen shows list of workload review requests submitted by personnel]*

This is the **Workload Review Requests** queue — operational concerns submitted by
personnel members.

These are different from **support requests** (which go only to welfare officers).
Workload review requests are operational in nature:

- "I have worked 9 consecutive days — requesting rotation"
- "My recorded hours show 48h but I worked 58h this week"
- "I have not taken leave in 60 days — requesting approved leave slot"

For each request, the commander can:

1. **Acknowledge**: "Seen, will review at next roster planning session"
2. **Resolve**: "Correction applied" (triggers duty ledger update if it's a duty correction)
3. **Escalate**: Forward to Welfare Officer if there appears to be a welfare angle

This concludes the Commander journey. Let us log out and briefly view the **Admin Panel**.

*[Click profile menu → "Logout"]*

---

## PART D — ADMIN PANEL

---

## 20. Admin Login and System Configuration

*[Back on landing page → Click "Admin" in demo panel → Login]*

*Note: Admin password is **Admin@1234** — different from the others which use Demo@1234*

*[Screen shows Admin dashboard]*

The admin manages **structure, not content**. They have full system-level control but
**cannot** read welfare case notes, AI analysis summaries, check-in answers, or any
individual content.

Let me walk through the four main admin sections quickly.

*[Click "User Management"]*

### User Management

*[Screen shows user list with actions]*

The admin can:
- **Create accounts** — assign email, role, unit, generate temporary password
- **Assign roles** — change a user's role (persisted in DB, takes effect on next login)
- **Assign units** — move a user to a different unit (all future queries scoped to new unit)
- **Disable accounts** — immediate session invalidation; login blocked
- **Enable accounts** — re-activates login
- **Reset passwords** — all active sessions invalidated; reset link sent
- **View login history** — last 10 logins with IP, timestamp, success/failure

*[Click "Unit Configuration"]*

### Unit Configuration

*[Screen shows unit list]*

The admin can create and configure units:
- Unit name and code
- Assigned welfare officers (one or more)
- Assigned commanders (one or more)
- **Minimum group size for aggregate suppression** (default: 10)
- Unit active/inactive flag

*[Click "Workload Policy"]*

### Workload Policy Configuration

*[Screen shows policy threshold configuration form]*

The admin can configure **workload policy thresholds** that drive the warning and
blocking flags in the Commander's workload view and the capacity check engine:

| Parameter | Demo Default | What It Controls |
|-----------|-------------|-----------------|
| Max weekly hours (warning) | 48h | Yellow flag on duty records |
| Max weekly hours (blocking) | 60h | Red flag, blocks new assignments |
| Consecutive days warning | 6 days | Yellow flag |
| Consecutive days blocking | 10 days | Red flag, blocks new assignments |
| Max night shifts (warning) | 3 in 14 days | Yellow flag |
| Recovery gap minimum (warning) | 10h | Yellow flag |
| Recovery gap minimum (blocking) | 8h | Red flag, blocks assignments |
| Night duty window start | 22:00 | Shifts starting after this are "night" |
| Night duty window end | 06:00 | Shifts ending before this are "night" |

These are labeled as **demonstration defaults**, not legal standards. In production,
these would be set according to service-specific regulations.

*[Click "Audit Log"]*

### Audit Log

*[Screen shows audit event table]*

The audit log records every significant action in the system:

| Event Type | Data Captured |
|-----------|--------------|
| Login attempt | User ID · IP · Timestamp · Success/Failure |
| Consent change | User ID · Consent type · Old value · New value · Timestamp |
| Check-in submitted | User ID · Check-in ID · Timestamp (no content) |
| Case accessed | Welfare officer ID · Personnel ID · Timestamp |
| Intervention recorded | Officer ID · Case ID · Intervention type · Timestamp |
| AI analysis requested | Check-in ID · Source (gemini/template) · Timestamp (no content) |
| CSV import | Officer ID · Import type · Record count · Timestamp |
| Account modified | Admin ID · Target user ID · Action · Timestamp |

**What is NOT logged** (privacy protection):
- Welfare case content or notes
- AI summary text
- Personnel's check-in answers or concern notes
- Conversation content between officer and personnel

The audit log answers: **who accessed what, and when** — not what was said.

---

This concludes the Admin Panel tour.

*[Click profile menu → "Logout"]*

---

## PART E — TECHNICAL ARCHITECTURE AND INTELLIGENCE LAYER

---

## 21. Backend Architecture Overview

*[Switch to architecture diagram slide or whiteboard]*

Let me briefly explain the **technical architecture** that powers what you just saw.

SAHAYAK is built on five layers:

### Layer 1 — User Interface
- **Next.js 15** with App Router
- Server-side rendering for initial page loads
- Role-specific dashboards with client-side routing

### Layer 2 — API Routes
- **Next.js Route Handlers** (Node.js runtime)
- RESTful API endpoints for auth, check-in, assessment, workload, cases, admin
- Middleware for authentication, authorization, and CSRF validation on every request

### Layer 3 — Business Logic
- **Assessment Engine** (RULES_V1) — deterministic welfare scoring
- **Workload Capacity Engine** — pre-assignment feasibility checks
- **AI Insight Engine** — anonymization layer + Gemini integration + template fallback
- **Audit Logger** — records every significant action

### Layer 4 — Database
- **PGlite** in development (WASM-based PostgreSQL, zero-install, persists to `.pglite/` folder)
- **PostgreSQL 16** in production
- **Drizzle ORM** for type-safe queries and schema-first migrations
- **38 tables** covering auth, welfare, workload, consent, audit
- **4 migrations** applied: 0000–0003

### Layer 5 — AI Integration
- **Google Gemini 2.5-flash** via v1beta API
- **Anonymization layer** strips all PII before external call
- **Template fallback engine** for zero-dependency operation
- `source` field always identifies which was used

---

## 22. Welfare Assessment Engine — RULES_V1 Deep Dive

*[Show factor breakdown table or diagram]*

The **Welfare Assessment Engine** runs every time a check-in is submitted.

It collects data from multiple database tables:
- `duty_records` — weekly hours, scheduled vs actual
- `night_duty_records` — night shifts in last 14 days
- `deployment_records` — current deployment status and duration
- `leave_records` — days since last approved leave
- `transfer_records` — transfers in last 12 months
- `training_records` — committed training days
- `checkins` — today's wellness data (only if wellness consent granted)

It then applies **RULES_V1** — a versioned, deterministic rule engine with **10 scoring factors**:

### Six Organizational Factors (max 103 points):
1. **Weekly duty hours** — 40h normal · 48h elevated · 60h critical → up to 20 pts
2. **Night shift frequency** — 1 normal · 3 elevated · 5 critical → up to 15 pts
3. **Consecutive duty days** — 3 normal · 6 elevated · 10 critical → up to 15 pts
4. **Leave deprivation** — 30d normal · 60d elevated · 90d critical → up to 15 pts
5. **Recent transfers** — 0 normal · 1 elevated · 2 critical → up to 8 pts
6. **Active deployment** — No=0 · Yes=10 → up to 10 pts

### Four Wellness Factors (max 40 points, only if consent granted):
7. **Fatigue** — Low ≤3 · Moderate ≤6 · High ≤8 · VeryHigh >8 → up to 15 pts
8. **Sleep hours** — Normal ≥7 · Low <5 · VeryLow <4 → up to 15 pts
9. **Sleep quality** — Good ≥4 · Fair ≥2 · Poor <2 → up to 10 pts
10. **Mood** — Good ≥4 · Fair ≥2 · Low <2 → up to 5 pts

**Total maximum:**
- With only organizational data: **103 points**
- With full wellness data: **143 points**

Based on the total score, priority is assigned:
- **Routine**: 0–24 points (green)
- **Watch**: 25–54 points (yellow)
- **Elevated**: 55+ points (orange/red)

The engine is **fully deterministic**. The same inputs always produce the same output.
There is no randomness and no black box.

**Key principle:** Missing wellness data contributes **zero points**. The system never
penalizes silence. If a person withdraws wellness consent, their max score becomes 103
instead of 143, and the score is shown as, for example, 45/103 — not 45/143.

---

## 23. AI Integration — Anonymization and Fallback

*[Show data flow diagram or code snippet]*

When a check-in is submitted and an AI analysis is requested, here's what happens:

### Step 1 — Anonymization
Before calling Gemini, the system strips all personally identifiable information:

**NEVER sent to Gemini:**
- Name, rank, service number
- Unit name or location
- Personnel ID or check-in ID
- Free-text concern note
- Previous case notes or interventions

**Sent to Gemini (anonymized):**
```json
{
  "factors": {
    "weeklyHours": { "value": 52, "score": 12, "threshold": "elevated" },
    "nightShifts": { "value": 2, "score": 8, "threshold": "normal" },
    "consecutiveDays": { "value": 7, "score": 15, "threshold": "elevated" },
    "fatigue": { "value": 9, "score": 15, "threshold": "veryHigh" },
    "sleepHours": { "value": 3.5, "score": 15, "threshold": "veryLow" }
  },
  "priority": "elevated",
  "trendAvailable": true
}
```

### Step 2 — Gemini API Call
- Model: `gemini-2.5-flash`
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Timeout: 15 seconds
- Retry: 1 retry on 5xx errors, no retry on 4xx

### Step 3 — Fallback on Failure
If the Gemini API call fails (timeout, 4xx, 5xx, missing key), the system automatically
runs the **template fallback engine**:

- Selects template based on which factors are at elevated/critical thresholds
- Fills in factor-specific language
- Returns summary with clear label: `source: "template"`

### Step 4 — Storage
The analysis is stored in the `checkin_analyses` table with:
- Check-in ID
- Summary text
- Source: "gemini" or "template"
- Generated timestamp
- `isLatest` flag (previous analysis set to false)

This architecture ensures that SAHAYAK remains **100% functional** even without an
external API key. The template fallback is not a degraded mode — it is a fully supported
operational mode.

---

## 24. Workload Capacity Engine

*[Show capacity check flowchart]*

The **Workload Capacity Engine** runs before any new duty assignment is committed.

It answers the question: **Can this person be assigned this duty without violating policy?**

### Pre-Assignment Checks (run in sequence):

1. **Leave conflict check**
   - Is the person on approved leave during this duty period?
   - Result: BLOCKING if true (cannot override)

2. **Duty overlap check**
   - Does this duty overlap with an existing assignment?
   - Result: BLOCKING if true

3. **Recovery gap check (critical)**
   - Is the gap from previous duty end time to new duty start time < 8 hours?
   - Result: BLOCKING if true

4. **Recovery gap check (warning)**
   - Is the gap < 10 hours?
   - Result: WARNING (can override with stated reason)

5. **Consecutive days check (critical)**
   - Would this assignment create 10 or more consecutive duty days?
   - Result: BLOCKING if true

6. **Consecutive days check (warning)**
   - Would this create 6 or more consecutive days?
   - Result: WARNING (can override)

7. **Weekly hours check (critical)**
   - Would total weekly hours reach or exceed 60?
   - Result: BLOCKING if true

8. **Weekly hours check (warning)**
   - Would total weekly hours reach or exceed 48?
   - Result: WARNING (can override)

### Finding Types:
- **BLOCKING** — hard stop, no bypass possible
- **WARNING** — can override but requires manager to state a reason
- **INFORMATIONAL** — advisory only
- **INSUFFICIENT_DATA** — policy threshold not configured

### Honest Infeasibility:
If a proposed schedule cannot be achieved with available personnel, the system returns
an explicit message:

*"Cannot fulfill coverage: 3 slots uncovered after applying all constraints. Add 3 more
available personnel or reduce coverage requirements."*

The system **never silently relaxes constraints** to make a plan appear feasible.
It **never invents personnel** who do not exist.

---

## 25. Quality Assurance — Test Coverage

*[Show test results screenshot or terminal output]*

SAHAYAK currently has **200 automated tests** across **8 test files**, all passing:

| Test File | Tests | What Is Covered |
|-----------|-------|----------------|
| `domain.test.ts` | 42 | RULES_V1 factor scoring, priority thresholds, edge cases |
| `auth.test.ts` | 28 | Login, session, CSRF, rate limiting, password hashing |
| `authorization.test.ts` | 31 | Role isolation: commander cannot see individual wellness, welfare officer cannot cross units |
| `regression.test.ts` | 24 | Score consistency: same input = same output always |
| `workload.test.ts` | 47 | Capacity checks, blocking/warning triggers, feasibility engine |
| `checkin-journey.test.ts` | 33 | Full check-in flow, AI consent gate, analysis storage, conversation scoping |
| `import.test.ts` | 18 | CSV parsing, duplicate detection, post-import reassessment |
| `ai-provider.test.ts` | 17 | Gemini call, template fallback, anonymization, source labeling |

**Key test cases:**
- Commander with valid session → cannot access individual wellness data → **403 Forbidden** (not UI hidden)
- Welfare officer from Unit A → cannot access Unit B cases → **403 Forbidden**
- Sleep 3.5h → exactly **15 points** (veryLow band, <4h)
- Sleep 4.5h → exactly **8 points** (low band, <5h but ≥4h)
- Same input on different dates → **identical output** (deterministic)
- No name/rank/unit in Gemini payload → **confirmed via test spy**
- Template fallback returned when API key missing → `source="template"` → **confirmed**

---

## 26. Future Development Roadmap

*[Show roadmap slide or list]*

What you have seen today is the **functional prototype** of SAHAYAK. In the next phase,
we plan to strengthen the platform through several enhancements:

### Phase 2 — Enhanced Data Collection
- **Wearable device integration** — smartwatch and fitness tracker data for automatic
  sleep and activity tracking, reducing manual input burden
- **Voice check-in** — Hindi and regional language support for audio-based check-ins
- **Offline mobile app** — for field deployments with limited connectivity; essential
  functions work locally and sync when connection restored

### Phase 3 — Predictive Analytics
- **Trend forecasting engine** — identifying unit-level patterns over weeks and months
  to flag early deterioration before it reaches Elevated threshold
- **Aggregate-only analysis** — uses only organizational data and aggregated wellness
  trends, never individual records, maintaining the same privacy guarantees

### Phase 4 — Integration
- **HRMS integration** — automatic import of duty, leave, deployment, and transfer data
  from existing Human Resource Management Systems
- **Medical record integration** — with explicit consent, pull medical visit history
  from service medical databases to inform welfare assessment

### Phase 5 — Scale and Deployment
- **Multi-force deployment** — extend to BSF, CRPF, CISF, ITBP, SSB, and Armed Forces
- **Regional language UI** — full interface translation for Hindi, Tamil, Telugu, Bengali,
  Marathi, Gujarati
- **Mobile-first redesign** — optimize for low-bandwidth, low-literacy scenarios

---

## CONCLUSION

---

## 27. Core Principles and Vision

*[Return to browser → show SAHAYAK landing page]*

Let me conclude by restating the **core principles** that guided SAHAYAK's design:

### 1. Transparency Over Black Box
Every welfare score is broken down factor by factor. Every point is explained. There is
no "AI said so" opacity.

### 2. Consent Over Compulsion
Wellness data collection requires explicit consent. AI processing requires explicit consent.
Users can withdraw at any time with immediate effect. Silence is never penalized.

### 3. Privacy by Architecture
Commanders see aggregates only — not names, not scores, not check-in history. This is
enforced at the API query level, not just hidden in the UI. Even with a session cookie,
unauthorized access returns 403.

### 4. Explainability Over Prediction
SAHAYAK does not predict who will "break down." It surfaces measurable indicators —
duty load, sleep deprivation, consecutive days — and explains why those matter.

### 5. Support Over Surveillance
The system connects people who need support with people who can provide it — welfare
officers. It is not a disciplinary tool. It is not a commander intelligence tool.

### 6. Honest Limitations
When the AI is unavailable, the system clearly labels the template fallback. When a
workload plan is infeasible, the system says so explicitly. No silent degradation. No
false certainty.

---

Our vision is straightforward:

**No warning sign should go unrecorded.**
**No service member under pressure should wait for an annual review.**
**And no one should be penalized for asking for support.**

SAHAYAK aims to bring structured, privacy-preserving, AI-assisted welfare monitoring
to every uniformed service member — because operational readiness depends on human
wellbeing, and human wellbeing deserves better tools than spreadsheets and annual surveys.

Thank you.

---

## APPENDIX — Quick Reference

---

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Personnel (Elevated) | ravi.kumar@sahayak.local | Demo@1234 |
| Welfare Officer | welfare.officer@sahayak.local | Demo@1234 |
| Commander | commander@sahayak.local | Demo@1234 |
| Admin | admin@sahayak.local | **Admin@1234** ⚠️ |

### Live URL
**http://localhost:3000**

### Key Metrics
- **Total automated tests**: 200
- **Database tables**: 38
- **Migrations applied**: 4 (0000–0003)
- **Welfare scoring factors**: 10 (6 org + 4 wellness)
- **Max score (org only)**: 103 points
- **Max score (with wellness)**: 143 points
- **Priority levels**: 3 (Routine / Watch / Elevated)
- **User roles**: 4 (Personnel / Welfare Officer / Commander / Admin)
- **AI model**: Gemini 2.5-flash
- **Fallback**: Template engine (zero external dependency)

### Tech Stack Summary
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + Shadcn/ui
- **Backend**: Node.js 20+ + Next.js API Routes
- **Database**: PGlite (dev) / PostgreSQL 16 (prod)
- **ORM**: Drizzle ORM
- **Auth**: bcrypt + HttpOnly sessions + CSRF tokens
- **AI**: Google Gemini 2.5-flash (v1beta)
- **Testing**: Vitest (200 tests passing)
- **Build**: Next.js build (Exit 0)

---

*End of demonstration script*
