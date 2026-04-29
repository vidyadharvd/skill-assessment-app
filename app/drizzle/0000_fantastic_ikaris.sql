CREATE TABLE IF NOT EXISTS "functions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcome_skills" (
	"outcome_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	CONSTRAINT "outcome_skills_outcome_id_skill_id_pk" PRIMARY KEY("outcome_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"function_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_rubrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer NOT NULL,
	"rubric_json" jsonb NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outcome_skills" ADD CONSTRAINT "outcome_skills_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outcome_skills" ADD CONSTRAINT "outcome_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roles" ADD CONSTRAINT "roles_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_rubrics" ADD CONSTRAINT "skill_rubrics_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subjects" ADD CONSTRAINT "subjects_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "functions_name_unique" ON "functions" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_skills_outcome_id_idx" ON "outcome_skills" USING btree ("outcome_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_skills_skill_id_idx" ON "outcome_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_skills_skill_id_outcome_id_idx" ON "outcome_skills" USING btree ("skill_id","outcome_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcomes_subject_id_idx" ON "outcomes" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outcomes_subject_id_description_unique" ON "outcomes" USING btree ("subject_id","description");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcomes_description_fts_idx" ON "outcomes" USING gin (to_tsvector('english', "description"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roles_function_id_idx" ON "roles" USING btree ("function_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_function_id_name_unique" ON "roles" USING btree ("function_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_rubrics_skill_id_idx" ON "skill_rubrics" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_rubrics_skill_id_version_unique" ON "skill_rubrics" USING btree ("skill_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skills_name_unique" ON "skills" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subjects_role_id_idx" ON "subjects" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_role_id_name_unique" ON "subjects" USING btree ("role_id","name");