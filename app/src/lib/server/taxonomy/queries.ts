import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import {
  functions,
  outcomeSkills,
  outcomes,
  roles,
  skills,
  subjects,
} from "@/lib/server/db/schema";

export type TaxonomyOption = {
  id: number;
  label: string;
};

/**
 * Fully-resolved taxonomy context for a single outcome — function → role →
 * subject → outcome — in one query.
 *
 * Used by the question generator (it needs the full breadcrumb in the
 * prompt) and the assessment view page (breadcrumb above the question).
 */
export type OutcomeContext = {
  functionId: number;
  functionName: string;
  roleId: number;
  roleName: string;
  subjectId: number;
  subjectName: string;
  outcomeId: number;
  outcomeDescription: string;
};

export type SkillRow = {
  id: number;
  name: string;
};

export async function listFunctions(): Promise<TaxonomyOption[]> {
  return db
    .select({
      id: functions.id,
      label: functions.name,
    })
    .from(functions)
    .orderBy(asc(functions.name));
}

export async function getFunctionById(functionId: number) {
  const [row] = await db
    .select({
      id: functions.id,
      label: functions.name,
    })
    .from(functions)
    .where(eq(functions.id, functionId))
    .limit(1);

  return row ?? null;
}

export async function listRolesByFunctionId(
  functionId: number,
): Promise<TaxonomyOption[]> {
  return db
    .select({
      id: roles.id,
      label: roles.name,
    })
    .from(roles)
    .where(eq(roles.functionId, functionId))
    .orderBy(asc(roles.name));
}

export async function getRoleById(roleId: number, functionId: number) {
  const [row] = await db
    .select({
      id: roles.id,
      label: roles.name,
    })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.functionId, functionId)))
    .limit(1);

  return row ?? null;
}

export async function listSubjectsByRoleId(
  roleId: number,
): Promise<TaxonomyOption[]> {
  return db
    .select({
      id: subjects.id,
      label: subjects.name,
    })
    .from(subjects)
    .where(eq(subjects.roleId, roleId))
    .orderBy(asc(subjects.name));
}

export async function getSubjectById(subjectId: number, roleId: number) {
  const [row] = await db
    .select({
      id: subjects.id,
      label: subjects.name,
    })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.roleId, roleId)))
    .limit(1);

  return row ?? null;
}

export async function listOutcomesBySubjectId(
  subjectId: number,
): Promise<TaxonomyOption[]> {
  return db
    .select({
      id: outcomes.id,
      label: outcomes.description,
    })
    .from(outcomes)
    .where(eq(outcomes.subjectId, subjectId))
    .orderBy(asc(outcomes.description));
}

export async function getOutcomeById(outcomeId: number, subjectId: number) {
  const [row] = await db
    .select({
      id: outcomes.id,
      label: outcomes.description,
    })
    .from(outcomes)
    .where(and(eq(outcomes.id, outcomeId), eq(outcomes.subjectId, subjectId)))
    .limit(1);

  return row ?? null;
}

/**
 * Resolve a single outcome up to its function via three joins.
 * Returns null if the outcome doesn't exist or its ancestry is broken
 * (which would indicate a seed bug).
 */
export async function getOutcomeContextById(
  outcomeId: number,
): Promise<OutcomeContext | null> {
  const [row] = await db
    .select({
      functionId: functions.id,
      functionName: functions.name,
      roleId: roles.id,
      roleName: roles.name,
      subjectId: subjects.id,
      subjectName: subjects.name,
      outcomeId: outcomes.id,
      outcomeDescription: outcomes.description,
    })
    .from(outcomes)
    .innerJoin(subjects, eq(subjects.id, outcomes.subjectId))
    .innerJoin(roles, eq(roles.id, subjects.roleId))
    .innerJoin(functions, eq(functions.id, roles.functionId))
    .where(eq(outcomes.id, outcomeId))
    .limit(1);

  return row ?? null;
}

/**
 * Skills mapped to a given outcome via `outcome_skills`. Caller must
 * snapshot the result into `assessment_skills` at assessment-creation
 * time — this query is the **live derivation path** only.
 */
export async function listSkillsByOutcomeId(
  outcomeId: number,
): Promise<SkillRow[]> {
  return db
    .select({
      id: skills.id,
      name: skills.name,
    })
    .from(outcomeSkills)
    .innerJoin(skills, eq(skills.id, outcomeSkills.skillId))
    .where(eq(outcomeSkills.outcomeId, outcomeId))
    .orderBy(asc(skills.name));
}
