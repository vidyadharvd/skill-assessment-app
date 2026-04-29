import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestDb,
  seedMinimalTaxonomy,
  type TestDb,
} from "@/test/test-db";

import type { SkillRubric } from "./generate";

// Hoisted mock state — vi.mock factories run before any imports.
const { dbHandle, generateRubricMock } = vi.hoisted(() => ({
  dbHandle: { current: null as unknown },
  generateRubricMock: vi.fn(),
}));

// Replace the real Supabase-backed Drizzle client with our pglite handle.
// Tests fill in `dbHandle.current` from `beforeAll`.
vi.mock("@/lib/server/db/client", () => ({
  get db() {
    if (!dbHandle.current) {
      throw new Error("test-db not initialized");
    }
    return dbHandle.current;
  },
}));

// We keep the rest of `./generate` (Zod schema, types) and only stub the
// LLM-bound `generateRubric` so cache-vs-miss behavior is observable.
vi.mock("./generate", async () => {
  const actual = await vi.importActual<typeof import("./generate")>(
    "./generate",
  );
  return {
    ...actual,
    generateRubric: generateRubricMock,
  };
});

import { skillRubrics } from "@/lib/server/db/schema";

import { getOrCreateRubric } from "./service";

const sampleRubric: SkillRubric = {
  skill: "Stakeholder communication",
  criteria: [
    "States audience and intent before describing the message.",
    "Adapts tone and detail to the named stakeholder.",
  ],
  scale: {
    "0": "No relevant evidence in the response.",
    "1": "Mentions audience but does not adapt the message.",
    "2": "Adapts at most one element to the audience.",
    "3": "Adapts tone and content with minor gaps.",
    "4": "Clear, well-targeted message with small slips.",
    "5": "Crisp, audience-perfect, with explicit reasoning.",
  },
  scoring_instructions: [
    "Anchor every claim in evidence from the candidate's response.",
    "Penalize generic advice that ignores the named stakeholder.",
    "Reward explicit framing of audience, intent, and structure.",
  ],
};

let db: TestDb;
let stakeholderSkillId: number;
let decisionSkillId: number;

const sharedInput = {
  functionName: "Product",
  roleName: "Product Manager",
  subjectName: "Stakeholder communication",
  outcomeDescription: "Communicate a launch decision to a non-technical exec.",
};

describe("getOrCreateRubric", () => {
  beforeAll(async () => {
    db = await createTestDb();
    dbHandle.current = db;
    const seeded = await seedMinimalTaxonomy(db);
    stakeholderSkillId = seeded.skills.find(
      (s) => s.name === "Stakeholder communication",
    )!.id;
    decisionSkillId = seeded.skills.find(
      (s) => s.name === "Decision-making under ambiguity",
    )!.id;
  });

  beforeEach(async () => {
    generateRubricMock.mockReset();
    // Fresh cache per test so each one drives the cache miss path
    // explicitly. Faster than rebuilding pglite.
    await db.delete(skillRubrics);
  });

  it("on cache miss: generates once, persists with version=1, returns the record", async () => {
    generateRubricMock.mockResolvedValueOnce(sampleRubric);

    const record = await getOrCreateRubric({
      ...sharedInput,
      skillId: stakeholderSkillId,
      skillName: "Stakeholder communication",
    });

    expect(generateRubricMock).toHaveBeenCalledTimes(1);
    expect(record.skillId).toBe(stakeholderSkillId);
    expect(record.version).toBe(1);
    expect(record.rubric.skill).toBe("Stakeholder communication");

    const persisted = await db.select().from(skillRubrics);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.skillId).toBe(stakeholderSkillId);
    expect(persisted[0]!.version).toBe(1);
  });

  it("on cache hit: returns the persisted rubric without calling the LLM", async () => {
    generateRubricMock.mockResolvedValueOnce(sampleRubric);
    await getOrCreateRubric({
      ...sharedInput,
      skillId: stakeholderSkillId,
      skillName: "Stakeholder communication",
    });
    expect(generateRubricMock).toHaveBeenCalledTimes(1);

    const cached = await getOrCreateRubric({
      ...sharedInput,
      skillId: stakeholderSkillId,
      skillName: "Stakeholder communication",
    });

    expect(generateRubricMock).toHaveBeenCalledTimes(1); // not 2
    expect(cached.skillId).toBe(stakeholderSkillId);
  });

  it("coalesces concurrent requests for the same skill into one LLM call", async () => {
    let resolveGenerate!: (value: SkillRubric) => void;
    generateRubricMock.mockImplementationOnce(
      () =>
        new Promise<SkillRubric>((resolve) => {
          resolveGenerate = resolve;
        }),
    );

    const args = {
      ...sharedInput,
      skillId: stakeholderSkillId,
      skillName: "Stakeholder communication",
    };

    const a = getOrCreateRubric(args);
    const b = getOrCreateRubric(args);
    const c = getOrCreateRubric(args);

    // Each call does a real `select ... limit 1` cache lookup against
    // pglite before reaching the in-flight map, so we have to wait for
    // those lookups to settle. Poll until the mock fires (cap at ~1s).
    const started = Date.now();
    while (
      generateRubricMock.mock.calls.length === 0 &&
      Date.now() - started < 1000
    ) {
      await new Promise((r) => setImmediate(r));
    }
    expect(generateRubricMock).toHaveBeenCalledTimes(1);

    resolveGenerate(sampleRubric);

    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra.id).toBe(rb.id);
    expect(rb.id).toBe(rc.id);
    expect(generateRubricMock).toHaveBeenCalledTimes(1);

    const persisted = await db.select().from(skillRubrics);
    expect(persisted).toHaveLength(1);
  });

  it("treats different skill ids as independent cache entries", async () => {
    generateRubricMock
      .mockResolvedValueOnce(sampleRubric)
      .mockResolvedValueOnce({
        ...sampleRubric,
        skill: "Decision-making under ambiguity",
      });

    const r1 = await getOrCreateRubric({
      ...sharedInput,
      skillId: stakeholderSkillId,
      skillName: "Stakeholder communication",
    });
    const r2 = await getOrCreateRubric({
      ...sharedInput,
      skillId: decisionSkillId,
      skillName: "Decision-making under ambiguity",
    });

    expect(r1.skillId).toBe(stakeholderSkillId);
    expect(r2.skillId).toBe(decisionSkillId);
    expect(generateRubricMock).toHaveBeenCalledTimes(2);

    const persisted = await db.select().from(skillRubrics);
    expect(persisted).toHaveLength(2);
  });
});
