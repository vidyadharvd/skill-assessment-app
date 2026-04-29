CREATE TYPE "public"."assessment_status" AS ENUM('DRAFT', 'GENERATED', 'SUBMITTED', 'EVALUATING', 'COMPLETED', 'FAILED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."response_skill_score_status" AS ENUM('PENDING', 'SCORED', 'FAILED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_skills" (
	"assessment_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	CONSTRAINT "assessment_skills_assessment_id_skill_id_pk" PRIMARY KEY("assessment_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"outcome_id" integer NOT NULL,
	"question_text" text,
	"overall_score" numeric(4, 2),
	"status" "assessment_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "response_skill_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"response_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"rubric_id" integer,
	"score" integer,
	"justification_text" text,
	"status" "response_skill_score_status" NOT NULL,
	"error_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_skill_scores_score_range" CHECK ("response_skill_scores"."score" IS NULL OR ("response_skill_scores"."score" BETWEEN 0 AND 5))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"answer_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_skills" ADD CONSTRAINT "assessment_skills_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_skills" ADD CONSTRAINT "assessment_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_skill_scores" ADD CONSTRAINT "response_skill_scores_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_skill_scores" ADD CONSTRAINT "response_skill_scores_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_skill_scores" ADD CONSTRAINT "response_skill_scores_rubric_id_skill_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."skill_rubrics"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "responses" ADD CONSTRAINT "responses_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_skills_assessment_id_idx" ON "assessment_skills" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_skills_skill_id_idx" ON "assessment_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_user_id_idx" ON "assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_outcome_id_idx" ON "assessments" USING btree ("outcome_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_status_idx" ON "assessments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "response_skill_scores_response_id_idx" ON "response_skill_scores" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "response_skill_scores_skill_id_idx" ON "response_skill_scores" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "response_skill_scores_status_idx" ON "response_skill_scores" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "response_skill_scores_response_id_skill_id_unique" ON "response_skill_scores" USING btree ("response_id","skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "response_skill_scores_skill_id_response_id_idx" ON "response_skill_scores" USING btree ("skill_id","response_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "responses_assessment_id_idx" ON "responses" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "responses_assessment_id_unique" ON "responses" USING btree ("assessment_id");