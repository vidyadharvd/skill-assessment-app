/**
 * In-memory Drizzle client for tests.
 *
 * Boots a fresh pglite instance, runs every migration in `/drizzle`, and
 * returns a Drizzle handle bound to the same `schema` the app uses. Tests
 * that touch the DB call `createTestDb()` once per `beforeAll` and then
 * mock `@/lib/server/db/client` to return this `db` instead of the real
 * Supabase-backed one.
 *
 * pglite is a real PostgreSQL build compiled to WASM, so every constraint
 * (CHECK, FK, unique index, enum) behaves exactly like production. That's
 * what makes this useful for the schema test in §11 of the build plan.
 */
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/lib/server/db/schema";

export type TestDb = PgliteDatabase<typeof schema> & { __pglite: PGlite };

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

export async function createTestDb(): Promise<TestDb> {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  // Stash the underlying pglite handle so callers can `.close()` if they
  // want to be tidy. (pglite cleans up on process exit, so leaks here are
  // harmless in practice.)
  Object.defineProperty(db, "__pglite", { value: pglite, enumerable: false });
  return db as unknown as TestDb;
}

/**
 * Tiny seeder for tests that need a minimal taxonomy slice. Returns the
 * seeded ids so tests can assert against them without re-querying.
 */
export async function seedMinimalTaxonomy(db: TestDb) {
  const [fnRow] = await db
    .insert(schema.functions)
    .values({ name: "Product" })
    .returning({ id: schema.functions.id });
  if (!fnRow) throw new Error("seed: functions insert failed");

  const [roleRow] = await db
    .insert(schema.roles)
    .values({ functionId: fnRow.id, name: "Product Manager" })
    .returning({ id: schema.roles.id });
  if (!roleRow) throw new Error("seed: roles insert failed");

  const [subjectRow] = await db
    .insert(schema.subjects)
    .values({ roleId: roleRow.id, name: "Stakeholder communication" })
    .returning({ id: schema.subjects.id });
  if (!subjectRow) throw new Error("seed: subjects insert failed");

  const [outcomeRow] = await db
    .insert(schema.outcomes)
    .values({
      subjectId: subjectRow.id,
      description: "Communicate a launch decision to a non-technical exec.",
    })
    .returning({ id: schema.outcomes.id });
  if (!outcomeRow) throw new Error("seed: outcomes insert failed");

  const skillRows = await db
    .insert(schema.skills)
    .values([
      { name: "Stakeholder communication" },
      { name: "Decision-making under ambiguity" },
    ])
    .returning({ id: schema.skills.id, name: schema.skills.name });

  await db.insert(schema.outcomeSkills).values(
    skillRows.map((s) => ({
      outcomeId: outcomeRow.id,
      skillId: s.id,
    })),
  );

  const [userRow] = await db
    .insert(schema.users)
    .values({
      email: "test@example.com",
      oauthProvider: "google",
      providerUserId: "google-test-1",
      name: "Test User",
    })
    .returning({ id: schema.users.id });
  if (!userRow) throw new Error("seed: users insert failed");

  return {
    functionId: fnRow.id,
    roleId: roleRow.id,
    subjectId: subjectRow.id,
    outcomeId: outcomeRow.id,
    userId: userRow.id,
    skills: skillRows,
  };
}
