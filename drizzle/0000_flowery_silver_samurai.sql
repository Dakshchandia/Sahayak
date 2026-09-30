CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."audit_event" AS ENUM('login', 'logout', 'login_failed', 'profile_accessed', 'profile_updated', 'checkin_submitted', 'checkin_edited', 'consent_granted', 'consent_withdrawn', 'support_requested', 'case_accessed', 'case_updated', 'case_assigned', 'case_closed', 'intervention_recorded', 'appointment_created', 'appointment_updated', 'note_created', 'note_accessed', 'export_generated', 'import_started', 'import_committed', 'role_changed', 'unit_assigned', 'assessment_generated', 'ai_explanation_requested', 'admin_action');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('new', 'reviewed', 'contacted', 'intervention_agreed', 'follow_up', 'closed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."data_record_type" AS ENUM('duty_schedule', 'deployment', 'leave', 'transfer', 'training');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'previewing', 'committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."intervention_type" AS ENUM('welfare_conversation', 'counsellor_referral', 'leave_review', 'duty_adjustment', 'recovery_planning', 'follow_up_conversation', 'no_action_needed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('support_request_received', 'case_assigned', 'appointment_scheduled', 'appointment_updated', 'follow_up_due', 'overdue_follow_up', 'case_status_changed', 'system');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('personnel', 'welfare_officer', 'commander', 'admin');--> statement-breakpoint
CREATE TABLE "alert_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"reviewed_by" integer NOT NULL,
	"is_false_alert" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer,
	"personnel_id" integer NOT NULL,
	"officer_id" integer NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"location" text,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"cancelled_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_factors" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"rationale" text
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"rule_version_id" integer NOT NULL,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"input_window_days" integer DEFAULT 30 NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"priority" text NOT NULL,
	"data_coverage" real DEFAULT 0 NOT NULL,
	"missing_data_flags" text[],
	"plain_explanation" text,
	"ai_explanation" text,
	"ai_explanation_source" text,
	"triggered_by" text
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_role" text,
	"event" "audit_event" NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"is_confidential" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "case_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"from_status" "case_status",
	"to_status" "case_status" NOT NULL,
	"changed_by" integer NOT NULL,
	"reason" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"check_in_date" date NOT NULL,
	"mood" integer,
	"sleep_hours" real,
	"sleep_quality" integer,
	"fatigue" integer,
	"perceived_workload" integer,
	"concern" text,
	"requested_support" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp,
	"edit_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"scope" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text DEFAULT '1.0' NOT NULL,
	"granted_at" timestamp,
	"withdrawn_at" timestamp,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"location" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"duration_days" integer,
	"is_currently_deployed" boolean DEFAULT false,
	"import_job_id" integer,
	"source_tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duty_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"weekly_hours" real NOT NULL,
	"night_shifts" integer DEFAULT 0 NOT NULL,
	"consecutive_days" integer DEFAULT 0,
	"rest_days" integer DEFAULT 0,
	"import_job_id" integer,
	"source_tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"field" text,
	"message" text NOT NULL,
	"raw_value" text
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_by" integer NOT NULL,
	"unit_id" integer,
	"record_type" "data_record_type" NOT NULL,
	"original_filename" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0,
	"valid_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"committed_rows" integer DEFAULT 0,
	"preview_data" jsonb,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"recorded_by" integer NOT NULL,
	"type" "intervention_type" NOT NULL,
	"description" text,
	"agreed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"leave_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"duration_days" integer NOT NULL,
	"approved" boolean DEFAULT true,
	"import_job_id" integer,
	"source_tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip_address" text,
	"success" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"email_failed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnel_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"rank" text,
	"service_number" text,
	"designation" text,
	"date_of_joining" date,
	"home_state" text,
	"marital_status" text,
	"dependants" integer DEFAULT 0,
	"emergency_contact" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personnel_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "personnel_profiles_service_number_unique" UNIQUE("service_number")
);
--> statement-breakpoint
CREATE TABLE "record_correction_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"field" text NOT NULL,
	"current_value" text,
	"requested_value" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"description" text,
	"rules_json" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	CONSTRAINT "rule_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"csrf_token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"check_in_id" integer,
	"preferred_contact" text,
	"availability_note" text,
	"urgency" text DEFAULT 'standard' NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" integer,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"location" text,
	"mandatory" boolean DEFAULT false,
	"import_job_id" integer,
	"source_tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_unit" text,
	"to_unit" text,
	"transfer_date" date NOT NULL,
	"reason" text,
	"import_job_id" integer,
	"source_tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"minimum_group_size" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "units_name_unique" UNIQUE("name"),
	CONSTRAINT "units_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"personnel_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'personnel' NOT NULL,
	"unit_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_personnel_id_unique" UNIQUE("personnel_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "welfare_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"personnel_id" integer NOT NULL,
	"assigned_officer_id" integer,
	"assessment_id" integer,
	"support_request_id" integer,
	"status" "case_status" DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'routine' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"closure_reason" text,
	"dismissal_reason" text,
	"next_follow_up_date" date,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_feedback" ADD CONSTRAINT "alert_feedback_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_feedback" ADD CONSTRAINT "alert_feedback_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_id_welfare_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."welfare_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_personnel_id_users_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_factors" ADD CONSTRAINT "assessment_factors_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_rule_version_id_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_welfare_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."welfare_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_case_id_welfare_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."welfare_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_records" ADD CONSTRAINT "deployment_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_records" ADD CONSTRAINT "deployment_records_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_records" ADD CONSTRAINT "duty_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_records" ADD CONSTRAINT "duty_records_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_case_id_welfare_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."welfare_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel_profiles" ADD CONSTRAINT "personnel_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_correction_requests" ADD CONSTRAINT "record_correction_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_correction_requests" ADD CONSTRAINT "record_correction_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_check_in_id_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_ins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_records" ADD CONSTRAINT "transfer_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_records" ADD CONSTRAINT "transfer_records_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_cases" ADD CONSTRAINT "welfare_cases_personnel_id_users_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_cases" ADD CONSTRAINT "welfare_cases_assigned_officer_id_users_id_fk" FOREIGN KEY ("assigned_officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_cases" ADD CONSTRAINT "welfare_cases_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_cases" ADD CONSTRAINT "welfare_cases_support_request_id_support_requests_id_fk" FOREIGN KEY ("support_request_id") REFERENCES "public"."support_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appt_personnel_idx" ON "appointments" USING btree ("personnel_id");--> statement-breakpoint
CREATE INDEX "appt_officer_idx" ON "appointments" USING btree ("officer_id");--> statement-breakpoint
CREATE INDEX "appt_scheduled_idx" ON "appointments" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "assessment_user_idx" ON "assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assessment_date_idx" ON "assessments" USING btree ("assessed_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_event_idx" ON "audit_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "audit_occurred_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "note_case_idx" ON "case_notes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "checkin_user_date_idx" ON "check_ins" USING btree ("user_id","check_in_date");--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_user_date_unique" ON "check_ins" USING btree ("user_id","check_in_date");--> statement-breakpoint
CREATE INDEX "consent_user_scope_idx" ON "consent_records" USING btree ("user_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_user_scope_version_idx" ON "consent_records" USING btree ("user_id","scope","policy_version");--> statement-breakpoint
CREATE INDEX "deploy_user_idx" ON "deployment_records" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_source_tag_idx" ON "deployment_records" USING btree ("source_tag");--> statement-breakpoint
CREATE INDEX "duty_user_period_idx" ON "duty_records" USING btree ("user_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "duty_source_tag_idx" ON "duty_records" USING btree ("source_tag");--> statement-breakpoint
CREATE INDEX "intervention_case_idx" ON "interventions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "leave_user_idx" ON "leave_records" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_source_tag_idx" ON "leave_records" USING btree ("source_tag");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notif_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "support_user_idx" ON "support_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "training_user_idx" ON "training_records" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_source_tag_idx" ON "training_records" USING btree ("source_tag");--> statement-breakpoint
CREATE INDEX "transfer_user_idx" ON "transfer_records" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_source_tag_idx" ON "transfer_records" USING btree ("source_tag");--> statement-breakpoint
CREATE INDEX "users_unit_idx" ON "users" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "case_personnel_idx" ON "welfare_cases" USING btree ("personnel_id");--> statement-breakpoint
CREATE INDEX "case_officer_idx" ON "welfare_cases" USING btree ("assigned_officer_id");--> statement-breakpoint
CREATE INDEX "case_status_idx" ON "welfare_cases" USING btree ("status");