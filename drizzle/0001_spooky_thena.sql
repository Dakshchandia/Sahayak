ALTER TABLE "assessment_factors" ADD COLUMN "max_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "max_possible_score" integer DEFAULT 103 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "is_latest" boolean DEFAULT true NOT NULL;