/**
 * Smoke test for the test-db helper itself. If this file fails, every
 * downstream DB test will too — keeping it isolated narrows the blast
 * radius when migrations break.
 */
import { describe, expect, it } from "vitest";

import { createTestDb, seedMinimalTaxonomy } from "./test-db";

describe("createTestDb", () => {
  it("boots pglite, runs migrations, and accepts a minimal taxonomy seed", async () => {
    const db = await createTestDb();
    const seeded = await seedMinimalTaxonomy(db);

    expect(seeded.functionId).toBeGreaterThan(0);
    expect(seeded.outcomeId).toBeGreaterThan(0);
    expect(seeded.skills.length).toBe(2);
  });
});
