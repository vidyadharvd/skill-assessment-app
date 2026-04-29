/**
 * Read-side accessor for a single assessment, scoped to the owning user.
 *
 * The view page at /assessment/[id] uses this. Anything that reads an
 * assessment row from a route handler should go through this helper —
 * never query `assessments` directly from a page — to keep the
 * "user can only see their own assessments" rule in one place.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import {
  assessmentSkills,
  assessments,
  functions,
  outcomes,
  responseSkillScores,
  responses,
  roles,
  skills,
  subjects,
} from "@/lib/server/db/schema";

export type AssessmentDetail = {
  id: number;
  status:
    | "DRAFT"
    | "GENERATED"
    | "SUBMITTED"
    | "EVALUATING"
    | "COMPLETED"
    | "FAILED"
    | "ABANDONED";
  questionText: string | null;
  responseText: string | null;
  createdAt: Date;
  context: {
    functionName: string;
    roleName: string;
    subjectName: string;
    outcomeDescription: string;
  };
  skills: { id: number; name: string }[];
};

export type AssessmentResults = {
  id: number;
  status:
    | "DRAFT"
    | "GENERATED"
    | "SUBMITTED"
    | "EVALUATING"
    | "COMPLETED"
    | "FAILED"
    | "ABANDONED";
  overallScore: number | null;
  createdAt: Date;
  completedAt: Date | null;
  questionText: string | null;
  responseText: string | null;
  context: {
    functionName: string;
    roleName: string;
    subjectName: string;
    outcomeDescription: string;
  };
  skillScores: {
    id: number;
    name: string;
    status: "PENDING" | "SCORED" | "FAILED";
    score: number | null;
    justificationText: string | null;
    errorText: string | null;
  }[];
};

export async function getAssessmentForUser(
  assessmentId: number,
  userId: number,
): Promise<AssessmentDetail | null> {
  const [row] = await db
    .select({
      id: assessments.id,
      status: assessments.status,
      questionText: assessments.questionText,
      responseText: responses.answerText,
      createdAt: assessments.createdAt,
      functionName: functions.name,
      roleName: roles.name,
      subjectName: subjects.name,
      outcomeDescription: outcomes.description,
    })
    .from(assessments)
    .innerJoin(outcomes, eq(outcomes.id, assessments.outcomeId))
    .innerJoin(subjects, eq(subjects.id, outcomes.subjectId))
    .innerJoin(roles, eq(roles.id, subjects.roleId))
    .innerJoin(functions, eq(functions.id, roles.functionId))
    .leftJoin(responses, eq(responses.assessmentId, assessments.id))
    .where(
      and(eq(assessments.id, assessmentId), eq(assessments.userId, userId)),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const skillRows = await db
    .select({ id: skills.id, name: skills.name })
    .from(assessmentSkills)
    .innerJoin(skills, eq(skills.id, assessmentSkills.skillId))
    .where(eq(assessmentSkills.assessmentId, row.id));

  return {
    id: row.id,
    status: row.status,
    questionText: row.questionText,
    responseText: row.responseText,
    createdAt: row.createdAt,
    context: {
      functionName: row.functionName,
      roleName: row.roleName,
      subjectName: row.subjectName,
      outcomeDescription: row.outcomeDescription,
    },
    skills: skillRows,
  };
}

export async function getAssessmentResultsForUser(
  assessmentId: number,
  userId: number,
): Promise<AssessmentResults | null> {
  const [row] = await db
    .select({
      id: assessments.id,
      status: assessments.status,
      overallScore: assessments.overallScore,
      questionText: assessments.questionText,
      responseText: responses.answerText,
      createdAt: assessments.createdAt,
      completedAt: assessments.completedAt,
      functionName: functions.name,
      roleName: roles.name,
      subjectName: subjects.name,
      outcomeDescription: outcomes.description,
    })
    .from(assessments)
    .innerJoin(outcomes, eq(outcomes.id, assessments.outcomeId))
    .innerJoin(subjects, eq(subjects.id, outcomes.subjectId))
    .innerJoin(roles, eq(roles.id, subjects.roleId))
    .innerJoin(functions, eq(functions.id, roles.functionId))
    .leftJoin(responses, eq(responses.assessmentId, assessments.id))
    .where(
      and(eq(assessments.id, assessmentId), eq(assessments.userId, userId)),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const scoreRows = await db
    .select({
      id: skills.id,
      name: skills.name,
      status: responseSkillScores.status,
      score: responseSkillScores.score,
      justificationText: responseSkillScores.justificationText,
      errorText: responseSkillScores.errorText,
    })
    .from(assessmentSkills)
    .innerJoin(skills, eq(skills.id, assessmentSkills.skillId))
    .leftJoin(
      responses,
      eq(responses.assessmentId, assessmentSkills.assessmentId),
    )
    .leftJoin(
      responseSkillScores,
      and(
        eq(responseSkillScores.responseId, responses.id),
        eq(responseSkillScores.skillId, assessmentSkills.skillId),
      ),
    )
    .where(eq(assessmentSkills.assessmentId, assessmentId));

  return {
    id: row.id,
    status: row.status,
    overallScore: parseNullableNumber(row.overallScore),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    questionText: row.questionText,
    responseText: row.responseText,
    context: {
      functionName: row.functionName,
      roleName: row.roleName,
      subjectName: row.subjectName,
      outcomeDescription: row.outcomeDescription,
    },
    skillScores: scoreRows.map((scoreRow) => ({
      id: scoreRow.id,
      name: scoreRow.name,
      status: scoreRow.status ?? "PENDING",
      score: scoreRow.score,
      justificationText: scoreRow.justificationText,
      errorText: scoreRow.errorText,
    })),
  };
}

function parseNullableNumber(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number.parseFloat(value);
}
