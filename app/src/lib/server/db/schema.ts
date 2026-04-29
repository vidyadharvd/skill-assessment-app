/**
 * Drizzle schema.
 *
 * Phase 1 introduces the static taxonomy layer:
 *   - functions, roles, subjects, outcomes, skills, outcome_skills, skill_rubrics
 *
 * Phase 4 adds the user layer:
 *   - users, assessments, assessment_skills, responses, response_skill_scores
 *
 * See docs/er_diagram_indexing_strategy.md for the source of truth.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const functions = pgTable(
  "functions",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("functions_name_unique").on(table.name)],
);

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    functionId: integer("function_id")
      .notNull()
      .references(() => functions.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
  },
  (table) => [
    index("roles_function_id_idx").on(table.functionId),
    uniqueIndex("roles_function_id_name_unique").on(
      table.functionId,
      table.name,
    ),
  ],
);

export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
  },
  (table) => [
    index("subjects_role_id_idx").on(table.roleId),
    uniqueIndex("subjects_role_id_name_unique").on(table.roleId, table.name),
  ],
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    description: text("description").notNull(),
  },
  (table) => [
    index("outcomes_subject_id_idx").on(table.subjectId),
    uniqueIndex("outcomes_subject_id_description_unique").on(
      table.subjectId,
      table.description,
    ),
    index("outcomes_description_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.description})`,
    ),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("skills_name_unique").on(table.name)],
);

export const outcomeSkills = pgTable(
  "outcome_skills",
  {
    outcomeId: integer("outcome_id")
      .notNull()
      .references(() => outcomes.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.outcomeId, table.skillId] }),
    index("outcome_skills_outcome_id_idx").on(table.outcomeId),
    index("outcome_skills_skill_id_idx").on(table.skillId),
    index("outcome_skills_skill_id_outcome_id_idx").on(
      table.skillId,
      table.outcomeId,
    ),
  ],
);

export const skillRubrics = pgTable(
  "skill_rubrics",
  {
    id: serial("id").primaryKey(),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    rubricJson: jsonb("rubric_json").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("skill_rubrics_skill_id_idx").on(table.skillId),
    uniqueIndex("skill_rubrics_skill_id_version_unique").on(
      table.skillId,
      table.version,
    ),
  ],
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    oauthProvider: text("oauth_provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_provider_user_id_unique").on(table.providerUserId),
  ],
);

// ---------------------------------------------------------------------------
// Phase 4 — User layer (assessments + responses + per-skill scores)
//
// See docs/er_diagram_indexing_strategy.md §3 for the source of truth on
// columns, and §5 for the indexing strategy mirrored below.
// ---------------------------------------------------------------------------

export const assessmentStatus = pgEnum("assessment_status", [
  "DRAFT",
  "GENERATED",
  "SUBMITTED",
  "EVALUATING",
  "COMPLETED",
  "FAILED",
  "ABANDONED",
]);

export const responseSkillScoreStatus = pgEnum("response_skill_score_status", [
  "PENDING",
  "SCORED",
  "FAILED",
]);

export const assessments = pgTable(
  "assessments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    outcomeId: integer("outcome_id")
      .notNull()
      .references(() => outcomes.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    questionText: text("question_text"),
    // Mean of per-skill scores; nullable until status = COMPLETED.
    overallScore: numeric("overall_score", { precision: 4, scale: 2 }),
    status: assessmentStatus("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("assessments_user_id_idx").on(table.userId),
    index("assessments_outcome_id_idx").on(table.outcomeId),
    index("assessments_status_idx").on(table.status),
  ],
);

// Skill snapshot per assessment — insulates historical assessments from
// future edits to outcome_skills.
export const assessmentSkills = pgTable(
  "assessment_skills",
  {
    assessmentId: integer("assessment_id")
      .notNull()
      .references(() => assessments.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.assessmentId, table.skillId] }),
    index("assessment_skills_assessment_id_idx").on(table.assessmentId),
    index("assessment_skills_skill_id_idx").on(table.skillId),
  ],
);

export const responses = pgTable(
  "responses",
  {
    id: serial("id").primaryKey(),
    assessmentId: integer("assessment_id")
      .notNull()
      .references(() => assessments.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    answerText: text("answer_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("responses_assessment_id_idx").on(table.assessmentId),
    uniqueIndex("responses_assessment_id_unique").on(table.assessmentId),
  ],
);

export const responseSkillScores = pgTable(
  "response_skill_scores",
  {
    id: serial("id").primaryKey(),
    responseId: integer("response_id")
      .notNull()
      .references(() => responses.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    // Nullable until SCORED — captures the exact rubric used for evaluation.
    rubricId: integer("rubric_id").references(() => skillRubrics.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    // 0–5 inclusive; nullable until SCORED.
    score: integer("score"),
    justificationText: text("justification_text"),
    status: responseSkillScoreStatus("status").notNull(),
    errorText: text("error_text"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("response_skill_scores_response_id_idx").on(table.responseId),
    index("response_skill_scores_skill_id_idx").on(table.skillId),
    index("response_skill_scores_status_idx").on(table.status),
    uniqueIndex("response_skill_scores_response_id_skill_id_unique").on(
      table.responseId,
      table.skillId,
    ),
    index("response_skill_scores_skill_id_response_id_idx").on(
      table.skillId,
      table.responseId,
    ),
    check(
      "response_skill_scores_score_range",
      sql`${table.score} IS NULL OR (${table.score} BETWEEN 0 AND 5)`,
    ),
  ],
);
