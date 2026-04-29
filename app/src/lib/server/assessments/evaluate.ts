import { and, asc, eq, inArray, sql } from "drizzle-orm";

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
import { evaluateSkill } from "@/lib/server/evaluator";
import {
  logServerEvent,
  serializeError,
} from "@/lib/server/observability";
import { getOrCreateRubric } from "@/lib/server/rubrics";

type AssessmentEvaluationPayload = {
  assessmentId: number;
  responseId: number;
  questionText: string;
  responseText: string;
  context: {
    functionName: string;
    roleName: string;
    subjectName: string;
    outcomeDescription: string;
  };
  skills: {
    id: number;
    name: string;
  }[];
};

type RunAssessmentEvaluationInput = {
  assessmentId: number;
  responseId: number;
  failedOnly?: boolean;
};

type RunAssessmentEvaluationResult = {
  assessmentId: number;
  responseId: number;
  status: "EVALUATING" | "COMPLETED" | "FAILED";
  evaluatedSkillCount: number;
};

const inFlightEvaluations = new Map<
  string,
  Promise<RunAssessmentEvaluationResult>
>();

export async function runAssessmentEvaluation(
  input: RunAssessmentEvaluationInput,
): Promise<RunAssessmentEvaluationResult> {
  const key = `${input.responseId}:${input.failedOnly ? "failed" : "all"}`;
  const existing = inFlightEvaluations.get(key);
  if (existing) {
    return existing;
  }

  const pending = runAssessmentEvaluationInternal(input).finally(() => {
    inFlightEvaluations.delete(key);
  });

  inFlightEvaluations.set(key, pending);
  return pending;
}

export async function retryFailedAssessmentEvaluation(
  input: Omit<RunAssessmentEvaluationInput, "failedOnly">,
): Promise<RunAssessmentEvaluationResult> {
  return runAssessmentEvaluation({
    ...input,
    failedOnly: true,
  });
}

export async function retryFailedAssessmentEvaluationForUser({
  assessmentId,
  userId,
}: {
  assessmentId: number;
  userId: number;
}): Promise<
  | { kind: "retried"; assessmentId: number; responseId: number }
  | { kind: "not_found" }
  | { kind: "invalid_status"; status: "DRAFT" | "GENERATED" | "SUBMITTED" | "EVALUATING" | "COMPLETED" | "FAILED" | "ABANDONED" }
  | { kind: "no_failed_skills" }
> {
  const [row] = await db
    .select({
      assessmentId: assessments.id,
      responseId: responses.id,
      status: assessments.status,
    })
    .from(assessments)
    .leftJoin(responses, eq(responses.assessmentId, assessments.id))
    .where(
      and(eq(assessments.id, assessmentId), eq(assessments.userId, userId)),
    )
    .limit(1);

  if (!row || row.responseId === null) {
    return { kind: "not_found" };
  }

  if (row.status !== "FAILED") {
    return { kind: "invalid_status", status: row.status };
  }

  const failedRows = await listSkillsByScoreStatus(row.responseId, ["FAILED"]);
  if (failedRows.length === 0) {
    return { kind: "no_failed_skills" };
  }

  await retryFailedAssessmentEvaluation({
    assessmentId: row.assessmentId,
    responseId: row.responseId,
  });

  return {
    kind: "retried",
    assessmentId: row.assessmentId,
    responseId: row.responseId,
  };
}

async function runAssessmentEvaluationInternal({
  assessmentId,
  responseId,
  failedOnly = false,
}: RunAssessmentEvaluationInput): Promise<RunAssessmentEvaluationResult> {
  const payload = await getAssessmentEvaluationPayload(
    assessmentId,
    responseId,
  );

  if (!payload) {
    throw new Error(
      `Cannot evaluate assessment ${assessmentId}: response ${responseId} was not found.`,
    );
  }

  if (payload.skills.length === 0) {
    throw new Error(
      `Cannot evaluate assessment ${assessmentId}: no snapshotted skills found.`,
    );
  }

  if (failedOnly) {
    await resetFailedRowsToPending(responseId);
  } else {
    await seedPendingSkillScores(responseId, payload.skills);
  }

  await db
    .update(assessments)
    .set({
      status: "EVALUATING",
      completedAt: null,
      overallScore: null,
    })
    .where(eq(assessments.id, assessmentId));

  const targetSkills = failedOnly
    ? await listSkillsByScoreStatus(responseId, ["PENDING"])
    : await listSkillsByScoreStatus(responseId, ["PENDING", "FAILED"]);

  await Promise.allSettled(
    targetSkills.map((skill) => evaluateAndPersistSkill(payload, skill)),
  );

  const finalStatus = await finalizeAssessmentEvaluation(
    assessmentId,
    responseId,
  );

  return {
    assessmentId,
    responseId,
    status: finalStatus,
    evaluatedSkillCount: targetSkills.length,
  };
}

async function getAssessmentEvaluationPayload(
  assessmentId: number,
  responseId: number,
): Promise<AssessmentEvaluationPayload | null> {
  const [row] = await db
    .select({
      assessmentId: assessments.id,
      responseId: responses.id,
      questionText: assessments.questionText,
      responseText: responses.answerText,
      functionName: functions.name,
      roleName: roles.name,
      subjectName: subjects.name,
      outcomeDescription: outcomes.description,
    })
    .from(assessments)
    .innerJoin(responses, eq(responses.assessmentId, assessments.id))
    .innerJoin(outcomes, eq(outcomes.id, assessments.outcomeId))
    .innerJoin(subjects, eq(subjects.id, outcomes.subjectId))
    .innerJoin(roles, eq(roles.id, subjects.roleId))
    .innerJoin(functions, eq(functions.id, roles.functionId))
    .where(and(eq(assessments.id, assessmentId), eq(responses.id, responseId)))
    .limit(1);

  if (!row || !row.questionText) {
    return null;
  }

  const skillRows = await db
    .select({
      id: skills.id,
      name: skills.name,
    })
    .from(assessmentSkills)
    .innerJoin(skills, eq(skills.id, assessmentSkills.skillId))
    .where(eq(assessmentSkills.assessmentId, assessmentId))
    .orderBy(asc(skills.name));

  return {
    assessmentId: row.assessmentId,
    responseId: row.responseId,
    questionText: row.questionText,
    responseText: row.responseText,
    context: {
      functionName: row.functionName,
      roleName: row.roleName,
      subjectName: row.subjectName,
      outcomeDescription: row.outcomeDescription,
    },
    skills: skillRows,
  };
}

async function seedPendingSkillScores(
  responseId: number,
  skillsToScore: { id: number }[],
): Promise<void> {
  await db
    .insert(responseSkillScores)
    .values(
      skillsToScore.map((skill) => ({
        responseId,
        skillId: skill.id,
        status: "PENDING" as const,
      })),
    )
    .onConflictDoNothing();
}

async function resetFailedRowsToPending(responseId: number): Promise<void> {
  await db
    .update(responseSkillScores)
    .set({
      status: "PENDING",
      rubricId: null,
      score: null,
      justificationText: null,
      errorText: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(responseSkillScores.responseId, responseId),
        eq(responseSkillScores.status, "FAILED"),
      ),
    );
}

async function listSkillsByScoreStatus(
  responseId: number,
  statuses: ("PENDING" | "FAILED")[],
): Promise<{ id: number; name: string }[]> {
  return db
    .select({
      id: skills.id,
      name: skills.name,
    })
    .from(responseSkillScores)
    .innerJoin(skills, eq(skills.id, responseSkillScores.skillId))
    .where(
      and(
        eq(responseSkillScores.responseId, responseId),
        inArray(responseSkillScores.status, statuses),
      ),
    )
    .orderBy(asc(skills.name));
}

async function evaluateAndPersistSkill(
  payload: AssessmentEvaluationPayload,
  skill: { id: number; name: string },
): Promise<void> {
  try {
    const rubric = await getOrCreateRubric({
      skillId: skill.id,
      skillName: skill.name,
      functionName: payload.context.functionName,
      roleName: payload.context.roleName,
      subjectName: payload.context.subjectName,
      outcomeDescription: payload.context.outcomeDescription,
    });

    const evaluation = await evaluateSkill({
      functionName: payload.context.functionName,
      roleName: payload.context.roleName,
      subjectName: payload.context.subjectName,
      outcomeDescription: payload.context.outcomeDescription,
      questionText: payload.questionText,
      responseText: payload.responseText,
      skillName: skill.name,
      rubric: rubric.rubric,
    });

    await db
      .update(responseSkillScores)
      .set({
        rubricId: rubric.id,
        score: evaluation.score,
        justificationText: evaluation.justification,
        status: "SCORED",
        errorText: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(responseSkillScores.responseId, payload.responseId),
          eq(responseSkillScores.skillId, skill.id),
        ),
      );
  } catch (error) {
    logServerEvent("error", "assessment.skill_evaluation_failed", {
      assessmentId: payload.assessmentId,
      responseId: payload.responseId,
      skillId: skill.id,
      skillName: skill.name,
      ...serializeError(error),
    });

    await db
      .update(responseSkillScores)
      .set({
        status: "FAILED",
        errorText: formatEvaluationError(error),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(responseSkillScores.responseId, payload.responseId),
          eq(responseSkillScores.skillId, skill.id),
        ),
      );
  }
}

async function finalizeAssessmentEvaluation(
  assessmentId: number,
  responseId: number,
): Promise<"EVALUATING" | "COMPLETED" | "FAILED"> {
  const scoreRows = await db
    .select({
      status: responseSkillScores.status,
      score: responseSkillScores.score,
    })
    .from(responseSkillScores)
    .where(eq(responseSkillScores.responseId, responseId));

  const hasPending = scoreRows.some((row) => row.status === "PENDING");
  if (hasPending) {
    await db
      .update(assessments)
      .set({
        status: "EVALUATING",
      })
      .where(eq(assessments.id, assessmentId));

    return "EVALUATING";
  }

  const hasFailed = scoreRows.some((row) => row.status === "FAILED");
  if (hasFailed) {
    await db
      .update(assessments)
      .set({
        status: "FAILED",
      })
      .where(eq(assessments.id, assessmentId));

    return "FAILED";
  }

  const numericScores = scoreRows
    .map((row) => row.score)
    .filter((score): score is number => typeof score === "number");

  if (numericScores.length === 0) {
    await db
      .update(assessments)
      .set({
        status: "FAILED",
      })
      .where(eq(assessments.id, assessmentId));

    return "FAILED";
  }

  const average =
    Math.round(
      (numericScores.reduce((sum, score) => sum + score, 0) /
        numericScores.length) *
        100,
    ) / 100;

  await db
    .update(assessments)
    .set({
      status: "COMPLETED",
      overallScore: sql`${average.toFixed(2)}`,
      completedAt: new Date(),
    })
    .where(eq(assessments.id, assessmentId));

  return "COMPLETED";
}

function formatEvaluationError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
