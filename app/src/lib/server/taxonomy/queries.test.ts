import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  functions,
  outcomes,
  outcomeSkills,
  roles,
  skills,
  subjects,
} from "@/lib/server/db/schema";
import { createTestDb, type TestDb } from "@/test/test-db";

// Hoisted handle, swapped in by `beforeAll`. Same pattern as rubrics test.
const { dbHandle } = vi.hoisted(() => ({
  dbHandle: { current: null as unknown },
}));

vi.mock("@/lib/server/db/client", () => ({
  get db() {
    if (!dbHandle.current) {
      throw new Error("test-db not initialized");
    }
    return dbHandle.current;
  },
}));

import {
  getOutcomeContextById,
  listFunctions,
  listOutcomesBySubjectId,
  listRolesByFunctionId,
  listSkillsByOutcomeId,
  listSubjectsByRoleId,
} from "./queries";

let db: TestDb;

type Ids = {
  productFnId: number;
  marketingFnId: number;
  pmRoleId: number;
  apmRoleId: number;
  growthRoleId: number;
  stakeholderSubjectId: number;
  prioritizationSubjectId: number;
  launchOutcomeId: number;
  trimOutcomeId: number;
  stakeholderSkillId: number;
  prioritizationSkillId: number;
};

let ids: Ids;

describe("taxonomy queries", () => {
  beforeAll(async () => {
    db = await createTestDb();
    dbHandle.current = db;

    // Seed two functions, multiple roles & subjects to exercise filtering.
    const [productFn] = await db
      .insert(functions)
      .values({ name: "Product" })
      .returning({ id: functions.id });
    const [marketingFn] = await db
      .insert(functions)
      .values({ name: "Marketing" })
      .returning({ id: functions.id });

    const productRoles = await db
      .insert(roles)
      .values([
        { functionId: productFn!.id, name: "Product Manager" },
        { functionId: productFn!.id, name: "Associate PM" },
      ])
      .returning({ id: roles.id, name: roles.name });

    const [growthRole] = await db
      .insert(roles)
      .values({ functionId: marketingFn!.id, name: "Growth Manager" })
      .returning({ id: roles.id });

    const pmRole = productRoles.find((r) => r.name === "Product Manager")!;
    const apmRole = productRoles.find((r) => r.name === "Associate PM")!;

    const subjectRows = await db
      .insert(subjects)
      .values([
        { roleId: pmRole.id, name: "Stakeholder communication" },
        { roleId: pmRole.id, name: "Prioritization" },
        { roleId: apmRole.id, name: "User research" },
      ])
      .returning({ id: subjects.id, name: subjects.name });

    const stakeholderSubject = subjectRows.find(
      (s) => s.name === "Stakeholder communication",
    )!;
    const prioritizationSubject = subjectRows.find(
      (s) => s.name === "Prioritization",
    )!;

    const outcomeRows = await db
      .insert(outcomes)
      .values([
        {
          subjectId: stakeholderSubject.id,
          description: "Communicate a launch decision to a non-technical exec.",
        },
        {
          subjectId: prioritizationSubject.id,
          description: "Trim a roadmap from 8 bets to 3 in one quarter.",
        },
      ])
      .returning({ id: outcomes.id, description: outcomes.description });

    const launchOutcome = outcomeRows.find((o) =>
      o.description.startsWith("Communicate"),
    )!;
    const trimOutcome = outcomeRows.find((o) =>
      o.description.startsWith("Trim"),
    )!;

    const skillRows = await db
      .insert(skills)
      .values([
        { name: "Stakeholder communication" },
        { name: "Prioritization" },
        { name: "Decision-making under ambiguity" },
      ])
      .returning({ id: skills.id, name: skills.name });

    const stakeholderSkill = skillRows.find(
      (s) => s.name === "Stakeholder communication",
    )!;
    const prioritizationSkill = skillRows.find(
      (s) => s.name === "Prioritization",
    )!;
    const decisionSkill = skillRows.find(
      (s) => s.name === "Decision-making under ambiguity",
    )!;

    await db.insert(outcomeSkills).values([
      { outcomeId: launchOutcome.id, skillId: stakeholderSkill.id },
      { outcomeId: launchOutcome.id, skillId: decisionSkill.id },
      { outcomeId: trimOutcome.id, skillId: prioritizationSkill.id },
    ]);

    ids = {
      productFnId: productFn!.id,
      marketingFnId: marketingFn!.id,
      pmRoleId: pmRole.id,
      apmRoleId: apmRole.id,
      growthRoleId: growthRole!.id,
      stakeholderSubjectId: stakeholderSubject.id,
      prioritizationSubjectId: prioritizationSubject.id,
      launchOutcomeId: launchOutcome.id,
      trimOutcomeId: trimOutcome.id,
      stakeholderSkillId: stakeholderSkill.id,
      prioritizationSkillId: prioritizationSkill.id,
    };
  });

  it("listFunctions returns all functions, alphabetically by name", async () => {
    const rows = await listFunctions();
    expect(rows.map((r) => r.label)).toEqual(["Marketing", "Product"]);
  });

  it("listRolesByFunctionId only returns roles for that function, sorted by name", async () => {
    const rows = await listRolesByFunctionId(ids.productFnId);
    expect(rows.map((r) => r.label)).toEqual([
      "Associate PM",
      "Product Manager",
    ]);

    const marketingRoles = await listRolesByFunctionId(ids.marketingFnId);
    expect(marketingRoles.map((r) => r.label)).toEqual(["Growth Manager"]);
  });

  it("listSubjectsByRoleId scopes to one role", async () => {
    const rows = await listSubjectsByRoleId(ids.pmRoleId);
    expect(rows.map((r) => r.label).sort()).toEqual([
      "Prioritization",
      "Stakeholder communication",
    ]);

    const apmRows = await listSubjectsByRoleId(ids.apmRoleId);
    expect(apmRows.map((r) => r.label)).toEqual(["User research"]);
  });

  it("listOutcomesBySubjectId returns outcomes for that subject only", async () => {
    const rows = await listOutcomesBySubjectId(ids.stakeholderSubjectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toMatch(/launch decision/);

    const empty = await listOutcomesBySubjectId(99_999);
    expect(empty).toEqual([]);
  });

  it("listSkillsByOutcomeId resolves the outcome→skill mapping, sorted by name", async () => {
    const rows = await listSkillsByOutcomeId(ids.launchOutcomeId);
    expect(rows.map((r) => r.name)).toEqual([
      "Decision-making under ambiguity",
      "Stakeholder communication",
    ]);

    const trim = await listSkillsByOutcomeId(ids.trimOutcomeId);
    expect(trim.map((r) => r.name)).toEqual(["Prioritization"]);
  });

  it("getOutcomeContextById walks all four ancestor joins in one row", async () => {
    const ctx = await getOutcomeContextById(ids.launchOutcomeId);
    expect(ctx).not.toBeNull();
    expect(ctx).toMatchObject({
      functionName: "Product",
      roleName: "Product Manager",
      subjectName: "Stakeholder communication",
      outcomeId: ids.launchOutcomeId,
    });
    expect(ctx!.outcomeDescription).toMatch(/launch decision/);
  });

  it("getOutcomeContextById returns null for an unknown outcome", async () => {
    const ctx = await getOutcomeContextById(99_999);
    expect(ctx).toBeNull();
  });
});
