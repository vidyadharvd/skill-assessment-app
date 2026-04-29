/**
 * Phase 11 schema test.
 *
 * Boots a fresh pglite, runs every committed migration in `/drizzle` in
 * order, then asserts the resulting schema matches the Drizzle definitions
 * the app actually uses at runtime. The point isn't to re-spec the schema
 * here — it's to catch:
 *
 *   • a migration that fails to apply on a clean database
 *   • a migration that diverges from the live `schema.ts`
 *   • a missing or orphaned migration in `_journal.json`
 *   • CHECK / FK / enum constraints silently dropped from a generated SQL file
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/lib/server/db/schema";
import { createTestDb } from "./test-db";

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

describe("drizzle migrations", () => {
  it("the journal lists every migration file in /drizzle, in order", async () => {
    const journalRaw = await readFile(
      path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
      "utf8",
    );
    const journal = JSON.parse(journalRaw) as {
      entries: { idx: number; tag: string }[];
    };

    const filesOnDisk = (await readdir(MIGRATIONS_FOLDER))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const journalTags = journal.entries
      .sort((a, b) => a.idx - b.idx)
      .map((e) => `${e.tag}.sql`);

    expect(filesOnDisk).toEqual(journalTags);
  });

  it("apply cleanly to an empty database", async () => {
    // createTestDb runs the full migrator; if any migration is malformed
    // or conflicts with prior state, this throws.
    await expect(createTestDb()).resolves.toBeDefined();
  });

  it("produce all tables expected by the live Drizzle schema", async () => {
    const db = await createTestDb();
    const rows = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'`,
    );
    const tableNames = new Set(rows.rows.map((r) => r.table_name));

    const expected = [
      "functions",
      "roles",
      "subjects",
      "outcomes",
      "skills",
      "outcome_skills",
      "skill_rubrics",
      "users",
      "assessments",
      "assessment_skills",
      "responses",
      "response_skill_scores",
    ];

    for (const t of expected) {
      expect(tableNames.has(t), `expected table "${t}"`).toBe(true);
    }
  });

  it("create the assessment_status and response_skill_score_status enums with the expected labels", async () => {
    const db = await createTestDb();
    const rows = await db.execute<{ enum_name: string; label: string }>(
      sql`SELECT t.typname AS enum_name, e.enumlabel AS label
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname IN ('assessment_status', 'response_skill_score_status')
          ORDER BY t.typname, e.enumsortorder`,
    );

    const grouped = rows.rows.reduce<Record<string, string[]>>((acc, row) => {
      (acc[row.enum_name] ??= []).push(row.label);
      return acc;
    }, {});

    expect(grouped.assessment_status).toEqual([
      "DRAFT",
      "GENERATED",
      "SUBMITTED",
      "EVALUATING",
      "COMPLETED",
      "FAILED",
      "ABANDONED",
    ]);
    expect(grouped.response_skill_score_status).toEqual([
      "PENDING",
      "SCORED",
      "FAILED",
    ]);
  });

  it("enforce the response_skill_scores 0-5 score range CHECK constraint", async () => {
    const db = await createTestDb();

    // Set up a minimal valid row: skill, user, outcome, assessment, response.
    const [skillRow] = await db
      .insert(schema.skills)
      .values({ name: "Decision-making under ambiguity" })
      .returning({ id: schema.skills.id });
    const [fnRow] = await db
      .insert(schema.functions)
      .values({ name: "Engineering" })
      .returning({ id: schema.functions.id });
    const [roleRow] = await db
      .insert(schema.roles)
      .values({ functionId: fnRow!.id, name: "Staff Engineer" })
      .returning({ id: schema.roles.id });
    const [subjectRow] = await db
      .insert(schema.subjects)
      .values({ roleId: roleRow!.id, name: "Technical leadership" })
      .returning({ id: schema.subjects.id });
    const [outcomeRow] = await db
      .insert(schema.outcomes)
      .values({
        subjectId: subjectRow!.id,
        description: "Pick patch-vs-rewrite under pressure.",
      })
      .returning({ id: schema.outcomes.id });
    const [userRow] = await db
      .insert(schema.users)
      .values({
        email: "schema@example.com",
        oauthProvider: "google",
        providerUserId: "google-schema-1",
      })
      .returning({ id: schema.users.id });
    const [assessmentRow] = await db
      .insert(schema.assessments)
      .values({
        userId: userRow!.id,
        outcomeId: outcomeRow!.id,
        status: "SUBMITTED",
        questionText: "schema test question",
      })
      .returning({ id: schema.assessments.id });
    const [responseRow] = await db
      .insert(schema.responses)
      .values({
        assessmentId: assessmentRow!.id,
        answerText: "schema test answer",
      })
      .returning({ id: schema.responses.id });

    // Inserting score = 6 must fail; score = 5 must succeed.
    await expect(
      db.insert(schema.responseSkillScores).values({
        responseId: responseRow!.id,
        skillId: skillRow!.id,
        status: "SCORED",
        score: 6,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.responseSkillScores).values({
        responseId: responseRow!.id,
        skillId: skillRow!.id,
        status: "SCORED",
        score: 5,
      }),
    ).resolves.toBeDefined();
  });

  it("enforce the responses.assessment_id unique index (one response per assessment)", async () => {
    const db = await createTestDb();

    const [fnRow] = await db
      .insert(schema.functions)
      .values({ name: "Product" })
      .returning({ id: schema.functions.id });
    const [roleRow] = await db
      .insert(schema.roles)
      .values({ functionId: fnRow!.id, name: "PM" })
      .returning({ id: schema.roles.id });
    const [subjectRow] = await db
      .insert(schema.subjects)
      .values({ roleId: roleRow!.id, name: "Comms" })
      .returning({ id: schema.subjects.id });
    const [outcomeRow] = await db
      .insert(schema.outcomes)
      .values({ subjectId: subjectRow!.id, description: "Communicate well." })
      .returning({ id: schema.outcomes.id });
    const [userRow] = await db
      .insert(schema.users)
      .values({
        email: "unique@example.com",
        oauthProvider: "google",
        providerUserId: "google-unique-1",
      })
      .returning({ id: schema.users.id });
    const [assessmentRow] = await db
      .insert(schema.assessments)
      .values({
        userId: userRow!.id,
        outcomeId: outcomeRow!.id,
        status: "SUBMITTED",
        questionText: "schema unique test",
      })
      .returning({ id: schema.assessments.id });

    await db
      .insert(schema.responses)
      .values({ assessmentId: assessmentRow!.id, answerText: "first" });

    // Second response for the same assessment must violate the unique idx.
    await expect(
      db
        .insert(schema.responses)
        .values({ assessmentId: assessmentRow!.id, answerText: "second" }),
    ).rejects.toThrow();
  });
});
