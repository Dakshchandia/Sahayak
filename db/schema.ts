import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  real,
  uniqueIndex,
  index,
  pgEnum,
  serial,
  jsonb,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", [
  "personnel",
  "welfare_officer",
  "commander",
  "admin",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "new",
  "reviewed",
  "contacted",
  "intervention_agreed",
  "follow_up",
  "closed",
  "dismissed",
]);

export const interventionTypeEnum = pgEnum("intervention_type", [
  "welfare_conversation",
  "counsellor_referral",
  "leave_review",
  "duty_adjustment",
  "recovery_planning",
  "follow_up_conversation",
  "no_action_needed",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "rescheduled",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "support_request_received",
  "case_assigned",
  "appointment_scheduled",
  "appointment_updated",
  "follow_up_due",
  "overdue_follow_up",
  "case_status_changed",
  "system",
]);

export const importStatusEnum = pgEnum("import_status", [
  "pending",
  "previewing",
  "committed",
  "failed",
]);

export const dataRecordTypeEnum = pgEnum("data_record_type", [
  "duty_schedule",
  "deployment",
  "leave",
  "transfer",
  "training",
]);

export const auditEventEnum = pgEnum("audit_event", [
  "login",
  "logout",
  "login_failed",
  "profile_accessed",
  "profile_updated",
  "checkin_submitted",
  "checkin_edited",
  "consent_granted",
  "consent_withdrawn",
  "support_requested",
  "case_accessed",
  "case_updated",
  "case_assigned",
  "case_closed",
  "intervention_recorded",
  "appointment_created",
  "appointment_updated",
  "note_created",
  "note_accessed",
  "export_generated",
  "import_started",
  "import_committed",
  "role_changed",
  "unit_assigned",
  "assessment_generated",
  "ai_explanation_requested",
  "admin_action",
]);

// ─── Units ────────────────────────────────────────────────────────────────────
export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  description: text("description"),
  minimumGroupSize: integer("minimum_group_size").notNull().default(10),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Users & Sessions ─────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    personnelId: text("personnel_id").unique(), // e.g. S-1042
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("personnel"),
    unitId: integer("unit_id").references(() => units.id),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at"),
  },
  (t) => [index("users_unit_idx").on(t.unitId), index("users_role_idx").on(t.role)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // UUID
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastAccessedAt: timestamp("last_accessed_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    ipAddress: text("ip_address"),
    success: boolean("success").notNull().default(false),
    attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email), index("login_attempts_ip_idx").on(t.ipAddress)]
);

// ─── Personnel Profiles ───────────────────────────────────────────────────────
export const personnelProfiles = pgTable("personnel_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  rank: text("rank"),
  serviceNumber: text("service_number").unique(),
  designation: text("designation"),
  dateOfJoining: date("date_of_joining"),
  homeState: text("home_state"),
  maritalStatus: text("marital_status"),
  dependants: integer("dependants").default(0),
  emergencyContact: text("emergency_contact"), // encrypted in production
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const recordCorrectionRequests = pgTable("record_correction_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  field: text("field").notNull(),
  currentValue: text("current_value"),
  requestedValue: text("requested_value").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Organizational Data Records ──────────────────────────────────────────────
export const dutyRecords = pgTable(
  "duty_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    weeklyHours: real("weekly_hours").notNull(),
    nightShifts: integer("night_shifts").notNull().default(0),
    consecutiveDays: integer("consecutive_days").default(0),
    restDays: integer("rest_days").default(0),
    importJobId: integer("import_job_id").references(() => importJobs.id),
    sourceTag: text("source_tag"), // identifier for idempotency
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("duty_user_period_idx").on(t.userId, t.periodStart),
    uniqueIndex("duty_source_tag_idx").on(t.sourceTag),
  ]
);

export const deploymentRecords = pgTable(
  "deployment_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    location: text("location"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    durationDays: integer("duration_days"),
    isCurrentlyDeployed: boolean("is_currently_deployed").default(false),
    importJobId: integer("import_job_id").references(() => importJobs.id),
    sourceTag: text("source_tag"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("deploy_user_idx").on(t.userId),
    uniqueIndex("deploy_source_tag_idx").on(t.sourceTag),
  ]
);

export const leaveRecords = pgTable(
  "leave_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    leaveType: text("leave_type").notNull(), // annual, medical, casual, etc.
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    durationDays: integer("duration_days").notNull(),
    approved: boolean("approved").default(true),
    importJobId: integer("import_job_id").references(() => importJobs.id),
    sourceTag: text("source_tag"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("leave_user_idx").on(t.userId),
    uniqueIndex("leave_source_tag_idx").on(t.sourceTag),
  ]
);

export const transferRecords = pgTable(
  "transfer_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    fromUnit: text("from_unit"),
    toUnit: text("to_unit"),
    transferDate: date("transfer_date").notNull(),
    reason: text("reason"),
    importJobId: integer("import_job_id").references(() => importJobs.id),
    sourceTag: text("source_tag"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("transfer_user_idx").on(t.userId),
    uniqueIndex("transfer_source_tag_idx").on(t.sourceTag),
  ]
);

export const trainingRecords = pgTable(
  "training_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    location: text("location"),
    mandatory: boolean("mandatory").default(false),
    importJobId: integer("import_job_id").references(() => importJobs.id),
    sourceTag: text("source_tag"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("training_user_idx").on(t.userId),
    uniqueIndex("training_source_tag_idx").on(t.sourceTag),
  ]
);

// ─── Import Jobs ──────────────────────────────────────────────────────────────
export const importJobs = pgTable("import_jobs", {
  id: serial("id").primaryKey(),
  uploadedBy: integer("uploaded_by")
    .notNull()
    .references(() => users.id),
  unitId: integer("unit_id").references(() => units.id),
  recordType: dataRecordTypeEnum("record_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  status: importStatusEnum("status").notNull().default("pending"),
  totalRows: integer("total_rows").default(0),
  validRows: integer("valid_rows").default(0),
  errorRows: integer("error_rows").default(0),
  committedRows: integer("committed_rows").default(0),
  previewData: jsonb("preview_data"), // first 10 rows for preview
  summary: text("summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  committedAt: timestamp("committed_at"),
});

export const importErrors = pgTable("import_errors", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => importJobs.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  field: text("field"),
  message: text("message").notNull(),
  rawValue: text("raw_value"),
});

// ─── Consent ──────────────────────────────────────────────────────────────────
export const consentRecords = pgTable(
  "consent_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    scope: text("scope").notNull(), // "wellness_checkins" | "wearable" | "ai_processing"
    granted: boolean("granted").notNull(),
    policyVersion: text("policy_version").notNull().default("1.0"),
    grantedAt: timestamp("granted_at"),
    withdrawnAt: timestamp("withdrawn_at"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("consent_user_scope_idx").on(t.userId, t.scope),
    uniqueIndex("consent_user_scope_version_idx").on(t.userId, t.scope, t.policyVersion),
  ]
);

// ─── Check-ins ────────────────────────────────────────────────────────────────
export const checkIns = pgTable(
  "check_ins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    checkInDate: date("check_in_date").notNull(),
    mood: integer("mood"), // 1-5
    sleepHours: real("sleep_hours"), // 0-16
    sleepQuality: integer("sleep_quality"), // 1-5
    fatigue: integer("fatigue"), // 1-10
    perceivedWorkload: integer("perceived_workload"), // 1-10
    concern: text("concern"), // optional free text, max 500 chars
    requestedSupport: boolean("requested_support").notNull().default(false),
    editedAt: timestamp("edited_at"),
    editReason: text("edit_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("checkin_user_date_idx").on(t.userId, t.checkInDate),
    uniqueIndex("checkin_user_date_unique").on(t.userId, t.checkInDate),
  ]
);

// ─── Rule / Model Versions ────────────────────────────────────────────────────
export const ruleVersions = pgTable("rule_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull().unique(), // e.g. "1.0.0"
  description: text("description"),
  rulesJson: jsonb("rules_json").notNull(), // serialized rule thresholds
  isActive: boolean("is_active").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  activatedAt: timestamp("activated_at"),
});

// ─── Assessments ──────────────────────────────────────────────────────────────
export const assessments = pgTable(
  "assessments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    ruleVersionId: integer("rule_version_id")
      .notNull()
      .references(() => ruleVersions.id),
    assessedAt: timestamp("assessed_at").notNull().defaultNow(),
    inputWindowDays: integer("input_window_days").notNull().default(30),
    totalScore: integer("total_score").notNull().default(0),
    maxPossibleScore: integer("max_possible_score").notNull().default(103),
    priority: text("priority").notNull(), // routine | watch | elevated
    dataCoverage: real("data_coverage").notNull().default(0), // 0.0-1.0
    missingDataFlags: text("missing_data_flags").array(),
    plainExplanation: text("plain_explanation"),
    aiExplanation: text("ai_explanation"),
    aiExplanationSource: text("ai_explanation_source"), // "gemini" | "template" | null
    triggeredBy: text("triggered_by"), // "checkin" | "import" | "scheduled" | "manual" | "consent" | "seed"
    isLatest: boolean("is_latest").notNull().default(true), // false for historical snapshots
  },
  (t) => [
    index("assessment_user_idx").on(t.userId),
    index("assessment_date_idx").on(t.assessedAt),
  ]
);

export const assessmentFactors = pgTable("assessment_factors", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id")
    .notNull()
    .references(() => assessments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // "Workload" | "Recovery" | "Deployment" | "Leave" | "Wellness"
  value: text("value").notNull(),
  points: integer("points").notNull().default(0),
  maxPoints: integer("max_points").notNull().default(0),
  rationale: text("rationale"),
});

// ─── Support Requests ─────────────────────────────────────────────────────────
export const supportRequests = pgTable(
  "support_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    checkInId: integer("check_in_id").references(() => checkIns.id),
    preferredContact: text("preferred_contact"), // "in_person" | "phone" | "message"
    availabilityNote: text("availability_note"),
    urgency: text("urgency").notNull().default("standard"), // "standard" | "urgent"
    acknowledged: boolean("acknowledged").notNull().default(false),
    acknowledgedBy: integer("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("support_user_idx").on(t.userId)]
);

// ─── Welfare Cases ────────────────────────────────────────────────────────────
export const welfareCases = pgTable(
  "welfare_cases",
  {
    id: serial("id").primaryKey(),
    personnelId: integer("personnel_id")
      .notNull()
      .references(() => users.id),
    assignedOfficerId: integer("assigned_officer_id").references(() => users.id),
    assessmentId: integer("assessment_id").references(() => assessments.id),
    supportRequestId: integer("support_request_id").references(() => supportRequests.id),
    status: caseStatusEnum("status").notNull().default("new"),
    priority: text("priority").notNull().default("routine"),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
    closureReason: text("closure_reason"),
    dismissalReason: text("dismissal_reason"),
    nextFollowUpDate: date("next_follow_up_date"),
    lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1), // optimistic concurrency
  },
  (t) => [
    index("case_personnel_idx").on(t.personnelId),
    index("case_officer_idx").on(t.assignedOfficerId),
    index("case_status_idx").on(t.status),
  ]
);

export const caseStatusHistory = pgTable("case_status_history", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id")
    .notNull()
    .references(() => welfareCases.id, { onDelete: "cascade" }),
  fromStatus: caseStatusEnum("from_status"),
  toStatus: caseStatusEnum("to_status").notNull(),
  changedBy: integer("changed_by")
    .notNull()
    .references(() => users.id),
  reason: text("reason"),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

// ─── Interventions ────────────────────────────────────────────────────────────
export const interventions = pgTable(
  "interventions",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => welfareCases.id),
    recordedBy: integer("recorded_by")
      .notNull()
      .references(() => users.id),
    type: interventionTypeEnum("type").notNull(),
    description: text("description"),
    agreedAt: timestamp("agreed_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("intervention_case_idx").on(t.caseId)]
);

// ─── Protected Case Notes ─────────────────────────────────────────────────────
export const caseNotes = pgTable(
  "case_notes",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => welfareCases.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(), // encrypted at rest in production
    isConfidential: boolean("is_confidential").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
  },
  (t) => [index("note_case_idx").on(t.caseId)]
);

// ─── False Alert Feedback ─────────────────────────────────────────────────────
export const alertFeedback = pgTable("alert_feedback", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id")
    .notNull()
    .references(() => assessments.id),
  reviewedBy: integer("reviewed_by")
    .notNull()
    .references(() => users.id),
  isFalseAlert: boolean("is_false_alert").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Appointments ─────────────────────────────────────────────────────────────
export const appointments = pgTable(
  "appointments",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").references(() => welfareCases.id),
    personnelId: integer("personnel_id")
      .notNull()
      .references(() => users.id),
    officerId: integer("officer_id")
      .notNull()
      .references(() => users.id),
    scheduledAt: timestamp("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    location: text("location"),
    status: appointmentStatusEnum("status").notNull().default("scheduled"),
    notes: text("notes"),
    cancelledReason: text("cancelled_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("appt_personnel_idx").on(t.personnelId),
    index("appt_officer_idx").on(t.officerId),
    index("appt_scheduled_idx").on(t.scheduledAt),
  ]
);

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    emailSent: boolean("email_sent").notNull().default(false),
    emailSentAt: timestamp("email_sent_at"),
    emailFailed: boolean("email_failed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notif_user_idx").on(t.userId),
    index("notif_read_idx").on(t.isRead),
  ]
);

// ─── Audit Events ─────────────────────────────────────────────────────────────
export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id),
    actorRole: text("actor_role"),
    event: auditEventEnum("event").notNull(),
    subjectType: text("subject_type"), // "user" | "case" | "checkin" | ...
    subjectId: text("subject_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_actor_idx").on(t.actorId),
    index("audit_event_idx").on(t.event),
    index("audit_occurred_idx").on(t.occurredAt),
    index("audit_subject_idx").on(t.subjectType, t.subjectId),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  unit: one(units, { fields: [users.unitId], references: [units.id] }),
  profile: one(personnelProfiles, {
    fields: [users.id],
    references: [personnelProfiles.userId],
  }),
  sessions: many(sessions),
  checkIns: many(checkIns),
  supportRequests: many(supportRequests),
  welfareCases: many(welfareCases, { relationName: "personnelCases" }),
  assignedCases: many(welfareCases, { relationName: "officerCases" }),
  notifications: many(notifications),
}));

export const welfareCasesRelations = relations(welfareCases, ({ one, many }) => ({
  personnel: one(users, {
    fields: [welfareCases.personnelId],
    references: [users.id],
    relationName: "personnelCases",
  }),
  officer: one(users, {
    fields: [welfareCases.assignedOfficerId],
    references: [users.id],
    relationName: "officerCases",
  }),
  assessment: one(assessments, {
    fields: [welfareCases.assessmentId],
    references: [assessments.id],
  }),
  supportRequest: one(supportRequests, {
    fields: [welfareCases.supportRequestId],
    references: [supportRequests.id],
  }),
  interventions: many(interventions),
  notes: many(caseNotes),
  statusHistory: many(caseStatusHistory),
  appointments: many(appointments),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  user: one(users, { fields: [assessments.userId], references: [users.id] }),
  ruleVersion: one(ruleVersions, {
    fields: [assessments.ruleVersionId],
    references: [ruleVersions.id],
  }),
  factors: many(assessmentFactors),
}));

export const unitsRelations = relations(units, ({ many }) => ({
  members: many(users),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// WORKLOAD & RECOVERY MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Permission design note ────────────────────────────────────────────────────
// Welfare analytics permissions  → welfare_officer role (confidential welfare data)
// Operational roster permissions → duty_manager role (duty/assignment data only)
//
// A commander has AGGREGATE-ONLY welfare access (existing behaviour unchanged).
// Individual duty/scheduling access requires the duty_manager role, which is
// kept entirely separate from welfare analytics so no role automatically grants
// access to both data categories.
//
// The duty_manager role is added to the roleEnum below. Existing personnel,
// welfare_officer, commander, and admin roles are not changed.

// NOTE: PGlite does not support ALTER TYPE … ADD VALUE inside a migration, so
// we keep duty_manager as a text column in duty-specific tables and document the
// intended constraint. A PostgreSQL production database should use the enum.

// ─── Unit Workload Policies ────────────────────────────────────────────────────
// Versioned, unit-scoped policies for workload/recovery limits.
// Policy changes do NOT rewrite historical records.
export const unitWorkloadPolicies = pgTable(
  "unit_workload_policies",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    version: integer("version").notNull().default(1),
    label: text("label").notNull().default("Default demonstration policy"),
    // Night duty window (local time, HH:MM format)
    nightStartHH: integer("night_start_hh").notNull().default(22), // 22:00
    nightEndHH: integer("night_end_hh").notNull().default(6),     // 06:00
    // Warning thresholds (triggers policy warning, not a hard block)
    warnWeeklyHoursExceeds: real("warn_weekly_hours_exceeds").default(48),
    warnConsecutiveDaysExceeds: integer("warn_consecutive_days_exceeds").default(6),
    warnNightShiftsPerMonthExceeds: integer("warn_night_shifts_per_month_exceeds").default(8),
    // Blocking thresholds (cannot be bypassed without an explicit override)
    blockWeeklyHoursExceeds: real("block_weekly_hours_exceeds").default(60),
    blockConsecutiveDaysExceeds: integer("block_consecutive_days_exceeds").default(10),
    // Recovery interval between duty periods (hours)
    minRecoveryHoursWarning: real("min_recovery_hours_warning").default(10),
    minRecoveryHoursBlock: real("min_recovery_hours_block").default(8),
    // Maximum additional hours per week before flag
    maxAdditionalHoursPerWeek: real("max_additional_hours_per_week").default(10),
    // Whether the policy is active for this unit
    isActive: boolean("is_active").notNull().default(true),
    // Explicitly labeled as demonstration configuration
    isDemoConfig: boolean("is_demo_config").notNull().default(true),
    demoConfigNote: text("demo_config_note").default(
      "DEMONSTRATION CONFIGURATION ONLY — not a legal standard."
    ),
    createdBy: integer("created_by").references(() => users.id),
    effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
    effectiveTo: timestamp("effective_to"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("policy_unit_idx").on(t.unitId), index("policy_active_idx").on(t.isActive)]
);

// ─── Skills & Qualifications ───────────────────────────────────────────────────
export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category"), // e.g. "tactical", "medical", "technical"
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const personnelSkills = pgTable(
  "personnel_skills",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id),
    certifiedAt: timestamp("certified_at"),
    expiresAt: timestamp("expires_at"),
    certifiedBy: integer("certified_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ps_user_idx").on(t.userId),
    uniqueIndex("ps_user_skill_idx").on(t.userId, t.skillId),
  ]
);

// ─── Duty Ledger ──────────────────────────────────────────────────────────────
// Per-shift duty intervals with scheduled vs actual times.
// Separate from duty_records (which is a weekly aggregate for the assessment engine).
// Both coexist — the ledger feeds the assessment service when actual hours are verified.
export const dutyLedger = pgTable(
  "duty_ledger",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    dutyType: text("duty_type").notNull().default("general"), // general | guard | patrol | training | administrative
    // Scheduled times (from the roster — store as UTC, display in local timezone)
    scheduledStart: timestamp("scheduled_start").notNull(),
    scheduledEnd: timestamp("scheduled_end").notNull(),
    scheduledBreakMinutes: integer("scheduled_break_minutes").default(0),
    // Actual times (from self-report or verification — null = not yet recorded)
    actualStart: timestamp("actual_start"),
    actualEnd: timestamp("actual_end"),
    actualBreakMinutes: integer("actual_break_minutes"),
    // Source and verification status
    // actualSource: "self_reported" | "supervisor" | "system" | "imported"
    actualSource: text("actual_source"),
    // verificationStatus: "pending" | "verified" | "disputed" | "no_actual_data"
    verificationStatus: text("verification_status").notNull().default("pending"),
    verifiedBy: integer("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at"),
    // Additional-duty fields
    isAdditionalDuty: boolean("is_additional_duty").notNull().default(false),
    additionalDutyReason: text("additional_duty_reason"),
    // Status of this duty entry
    // status: "scheduled" | "completed" | "cancelled" | "in_progress"
    status: text("status").notNull().default("scheduled"),
    // Derived fields (computed and stored for querying; recalculated on verify)
    scheduledDurationMinutes: integer("scheduled_duration_minutes"),
    actualDurationMinutes: integer("actual_duration_minutes"),
    additionalMinutes: integer("additional_minutes").default(0),
    nightDurationMinutes: integer("night_duration_minutes").default(0),
    recoveryIntervalMinutes: integer("recovery_interval_minutes"),
    hasOverlapFlag: boolean("has_overlap_flag").notNull().default(false),
    // Import linkage
    importJobId: integer("import_job_id").references(() => importJobs.id),
    sourceTag: text("source_tag"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId),
    index("ledger_unit_idx").on(t.unitId),
    index("ledger_scheduled_start_idx").on(t.scheduledStart),
    index("ledger_status_idx").on(t.status),
    uniqueIndex("ledger_source_tag_idx").on(t.sourceTag),
  ]
);

// ─── Duty Corrections ─────────────────────────────────────────────────────────
// Personnel can report discrepancies in scheduled vs actual duty.
// A correction request is evidence awaiting review — NOT an automatic record change.
export const dutyCorrections = pgTable(
  "duty_corrections",
  {
    id: serial("id").primaryKey(),
    dutyLedgerId: integer("duty_ledger_id").references(() => dutyLedger.id),
    reportedBy: integer("reported_by")
      .notNull()
      .references(() => users.id),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    // What the personnel member is reporting
    reportedActualStart: timestamp("reported_actual_start"),
    reportedActualEnd: timestamp("reported_actual_end"),
    reportedBreakMinutes: integer("reported_break_minutes"),
    isUnrecordedDuty: boolean("is_unrecorded_duty").notNull().default(false),
    explanation: text("explanation").notNull(),
    // Review workflow: submitted → under_review → approved | partially_approved | rejected
    status: text("status").notNull().default("submitted"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    reviewDecision: text("review_decision"), // free text reason
    // Self-approval prevention enforced in API layer
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("correction_reporter_idx").on(t.reportedBy),
    index("correction_unit_idx").on(t.unitId),
    index("correction_status_idx").on(t.status),
  ]
);

// ─── Operational Assignments ───────────────────────────────────────────────────
// Task/assignment records for capacity planning.
// Separate from welfare cases — no psychological data here.
export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    assigneeId: integer("assignee_id").references(() => users.id),
    requiredSkillId: integer("required_skill_id").references(() => skills.id),
    // Effort and scheduling
    estimatedEffortHours: real("estimated_effort_hours"),
    plannedStart: timestamp("planned_start"),
    plannedEnd: timestamp("planned_end"),
    deadline: timestamp("deadline"),
    priority: text("priority").notNull().default("normal"), // low | normal | high | critical
    // Whether effort is within an existing scheduled duty or additional
    effortType: text("effort_type").notNull().default("additional"),
    // "within_shift" = counted within existing duty hours (no double-count)
    // "additional"   = effort on top of scheduled hours
    linkedDutyLedgerId: integer("linked_duty_ledger_id").references(() => dutyLedger.id),
    // Workflow
    status: text("status").notNull().default("draft"),
    // draft | pending_approval | approved | in_progress | completed | cancelled
    assignmentReason: text("assignment_reason"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: integer("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    // Capacity check result (stored when assignment is confirmed)
    capacityCheckResult: jsonb("capacity_check_result"),
    // Override (when a manager proceeds despite a warning/conflict)
    overrideReason: text("override_reason"),
    overriddenBy: integer("overridden_by").references(() => users.id),
    overriddenAt: timestamp("overridden_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("assign_unit_idx").on(t.unitId),
    index("assign_assignee_idx").on(t.assigneeId),
    index("assign_status_idx").on(t.status),
    index("assign_deadline_idx").on(t.deadline),
  ]
);

// ─── Workload Review Requests ─────────────────────────────────────────────────
// Personnel formally request a workload review from their operational manager.
// SEPARATE from the welfare support request (which goes to the welfare officer).
// Workload requests are operationally managed, not clinically confidential.
export const workloadReviewRequests = pgTable(
  "workload_review_requests",
  {
    id: serial("id").primaryKey(),
    requestedBy: integer("requested_by")
      .notNull()
      .references(() => users.id),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    // Reason category
    reason: text("reason").notNull(),
    // "hours_exceed_roster" | "repeated_additional" | "insufficient_recovery" |
    // "conflicting_deadlines" | "postponed_rest" | "capacity_exceeded" | "other"
    explanation: text("explanation").notNull(),
    preferredAdjustment: text("preferred_adjustment"),
    // References to specific records
    linkedDutyLedgerIds: integer("linked_duty_ledger_ids").array(),
    linkedAssignmentIds: integer("linked_assignment_ids").array(),
    // Visibility notice shown before submission (stored for audit)
    visibilityAcknowledged: boolean("visibility_acknowledged").notNull().default(false),
    visibilityNote: text("visibility_note").default(
      "This request is visible to your operational manager and unit administrator. It is NOT routed to the confidential welfare officer unless you separately request welfare support."
    ),
    // Workflow: submitted → acknowledged → under_review → adjustment_proposed → resolved | closed_no_adjustment
    status: text("status").notNull().default("submitted"),
    acknowledgedBy: integer("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    proposedAdjustment: text("proposed_adjustment"),
    proposedAt: timestamp("proposed_at"),
    personnelResponse: text("personnel_response"),
    personnelRespondedAt: timestamp("personnel_responded_at"),
    closureNote: text("closure_note"),
    closedAt: timestamp("closed_at"),
    // Explicitly prohibited consequences (enforced at app layer)
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("wlr_requester_idx").on(t.requestedBy),
    index("wlr_unit_idx").on(t.unitId),
    index("wlr_status_idx").on(t.status),
  ]
);

// ─── Rebalancing Scenarios (Planner) ──────────────────────────────────────────
// Proposed roster changes — kept strictly separate from the live roster.
export const rebalancingScenarios = pgTable(
  "rebalancing_scenarios",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    title: text("title").notNull(),
    description: text("description"),
    // Date range
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    // Workflow: draft → reviewed → approved → applied
    status: text("status").notNull().default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    approvedBy: integer("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    appliedAt: timestamp("applied_at"),
    appliedBy: integer("applied_by").references(() => users.id),
    // Feasibility result (JSON — includes infeasibility explanation if constraints unmet)
    feasibilityResult: jsonb("feasibility_result"),
    // Change summary shown before apply
    changeSummary: jsonb("change_summary"),
    // Proposed changes as JSON array of {type, userId, dutyLedgerId, from, to, reason}
    proposedChanges: jsonb("proposed_changes").notNull().default([]),
    // Disclaimer stored with every scenario
    disclaimer: text("disclaimer").notNull().default(
      "SCENARIO ESTIMATES ONLY. Based on current duty records and stated assumptions. Does not predict mental-health outcomes. Wellness indicators excluded. No real schedules changed until explicitly applied after approval."
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("scenario_unit_idx").on(t.unitId),
    index("scenario_status_idx").on(t.status),
  ]
);

// ─── Duty Manager Unit Access ──────────────────────────────────────────────────
// Tracks which users have operational scheduling access to which units.
// This is SEPARATE from the welfare officer's unit assignment.
// A user can have duty manager access to a unit even if their primary role is commander.
export const dutyManagerAccess = pgTable(
  "duty_manager_access",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    // canViewIndividualDuty: see per-person duty ledger (NOT wellness)
    canViewIndividualDuty: boolean("can_view_individual_duty").notNull().default(true),
    // canEditRoster: approve/reject corrections, create duty ledger entries
    canEditRoster: boolean("can_edit_roster").notNull().default(false),
    // canApproveAssignments: confirm operational assignments
    canApproveAssignments: boolean("can_approve_assignments").notNull().default(false),
    // canApplyScenarios: apply approved rebalancing scenarios
    canApplyScenarios: boolean("can_apply_scenarios").notNull().default(false),
    grantedBy: integer("granted_by")
      .notNull()
      .references(() => users.id),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    revokedAt: timestamp("revoked_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("dma_user_idx").on(t.userId),
    index("dma_unit_idx").on(t.unitId),
    uniqueIndex("dma_user_unit_idx").on(t.userId, t.unitId),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// AI-ASSISTED CHECK-IN JOURNEY
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Check-in Analyses ────────────────────────────────────────────────────────
// Stores the personalized insight result for each check-in.
// One record per check-in (upserted when analysis is regenerated after an edit).
// Keeps AI source, template fallback label, structured observations, and actions.
// Personal notes / concern text is NEVER stored here — it stays only in check_ins.
export const checkInAnalyses = pgTable(
  "checkin_analyses",
  {
    id: serial("id").primaryKey(),
    checkInId: integer("checkin_id")
      .notNull()
      .unique()
      .references(() => checkIns.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    assessmentId: integer("assessment_id").references(() => assessments.id),
    // Summary paragraph shown to the user
    summary: text("summary").notNull(),
    // Source of the summary
    summarySource: text("summary_source").notNull().default("template"),
    // "gemini" | "template"
    // JSON array of { id, text, inputRef, kind }
    observations: jsonb("observations").notNull().default([]),
    // JSON: { period, comparison, note } — null if insufficient history
    trendSummary: jsonb("trend_summary"),
    // JSON array of { actionId, reason, label }
    suggestedActions: jsonb("suggested_actions").notNull().default([]),
    // JSON array of { questionId, text, options } — at most 2
    followUpQuestions: jsonb("follow_up_questions").notNull().default([]),
    // JSON array of { questionId, answerId, answerText } — stored when user answers
    followUpAnswers: jsonb("follow_up_answers").notNull().default([]),
    // Whether a revised summary was generated after follow-up answers
    revisedSummary: text("revised_summary"),
    revisedAt: timestamp("revised_at"),
    // Missing data that would have improved the analysis
    missingContext: text("missing_context").array(),
    // Set when an edit invalidates this analysis (new one will be generated)
    invalidatedAt: timestamp("invalidated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("cia_user_idx").on(t.userId),
    index("cia_checkin_idx").on(t.checkInId),
  ]
);

// ─── Check-in Conversations ───────────────────────────────────────────────────
// Optional AI conversation turns linked to a specific check-in.
// Messages are scoped to one check-in only — not a general chatbot.
// Raw message text is stored but excluded from audit logs.
export const checkInConversations = pgTable(
  "checkin_conversations",
  {
    id: serial("id").primaryKey(),
    checkInId: integer("checkin_id")
      .notNull()
      .references(() => checkIns.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    // "user" | "assistant"
    role: text("role").notNull(),
    // Content stored for personal history; excluded from audit records
    content: text("content").notNull(),
    // "gemini" | "template" | null for user messages
    source: text("source"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("conv_checkin_idx").on(t.checkInId),
    index("conv_user_idx").on(t.userId),
  ]
);
