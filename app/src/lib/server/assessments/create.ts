/**
 * Create-assessment orchestrator.
 *
 * The wizard's "Generate Assessment" button flows through here. This is
 * the only place that:
 *
 *   1. Resolves the outcome's full taxonomy context.
 *   2. Snapshots the live `outcome_skills` mapping.
 *   3. Calls the LLM to generate the question.
 *   4. Persists `assessments` (in GENERATED) + `assessment_skills` rows
 *      atomically.
 *
 * We still avoid holding the transaction open during question generation,
 * but Phase 10 creates the assessment row first in `DRAFT` so generation
 * failures can be retried on the same record.
 *
 * Concurrency rule (UX §4): if the user already has an active assessment,
 * we surface that id back to the caller — the route handler decides
 * whether to redirect or surface a banner. We do NOT silently abandon
 * the existing one.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import { assessmentSkills, assessments } from "@/lib/server/db/schema";
import {
  logServerEvent,
  serializeError,
} from "@/lib/server/observability";
import { generateQuestion } from "@/lib/server/questions";
import {
  getOutcomeContextById,
  listSkillsByOutcomeId,
} from "@/lib/server/taxonomy/queries";

import {
  ACTIVE_ASSESSMENT_STATUSES,
  findActiveAssessmentForUser,
} from "./active";
import {
  AssessmentGenerationError,
  getGenerationFailureCode,
} from "./errors";

export type CreateAssessmentResult =
  | {
      kind: "created";
      assessmentId: number;
    }
  | {
      kind: "active_exists";
      assessmentId: number;
    }
  | {
      kind: "outcome_not_found";
    }
  | {
      kind: "no_skills_mapped";
    };

export type CreateAssessmentInput = {
  userId: number;
  outcomeId: number;
};

export async function createAssessmentFromOutcome({
  userId,
  outcomeId,
}: CreateAssessmentInput): Promise<CreateAssessmentResult> {
  const existing = await findActiveAssessmentForUser(userId);
  if (existing) {
    return { kind: "active_exists", assessmentId: existing.id };
  }

  const context = await getOutcomeContextById(outcomeId);
  if (!context) {
    return { kind: "outcome_not_found" };
  }

  const skillRows = await listSkillsByOutcomeId(outcomeId);
  if (skillRows.length === 0) {
    return { kind: "no_skills_mapped" };
  }

  const result = await db.transaction(async (tx) => {
    // Re-check inside the transaction. Cheap insurance against the user
    // double-clicking Generate while the LLM call was in flight, or two
    // tabs racing.
    const [recheck] = await tx
      .select({ id: assessments.id })
      .from(assessments)
      .where(
        and(
          eq(assessments.userId, userId),
          inArray(assessments.status, [...ACTIVE_ASSESSMENT_STATUSES]),
        ),
      );

    if (recheck) {
      return { created: false, assessmentId: recheck.id };
    }

    const [inserted] = await tx
      .insert(assessments)
      .values({
        userId,
        outcomeId: context.outcomeId,
        status: "DRAFT",
      })
      .returning({ id: assessments.id });

    if (!inserted) {
      throw new Error("Failed to insert assessments row");
    }

    await tx.insert(assessmentSkills).values(
      skillRows.map((s) => ({
        assessmentId: inserted.id,
        skillId: s.id,
      })),
    );

    return { created: true, assessmentId: inserted.id };
  });

  return result.created
    ? finishQuestionGeneration({
        assessmentId: result.assessmentId,
        context,
        skillNames: skillRows.map((s) => s.name),
      })
    : { kind: "active_exists", assessmentId: result.assessmentId };
}

export async function retryAssessmentGeneration({
  assessmentId,
  userId,
}: {
  assessmentId: number;
  userId: number;
}): Promise<
  | { kind: "regenerated"; assessmentId: number }
  | { kind: "not_found" }
  | { kind: "invalid_status"; status: "DRAFT" | "GENERATED" | "SUBMITTED" | "EVALUATING" | "COMPLETED" | "FAILED" | "ABANDONED" }
> {
  const [row] = await db
    .select({
      id: assessments.id,
      outcomeId: assessments.outcomeId,
      status: assessments.status,
    })
    .from(assessments)
    .where(
      and(eq(assessments.id, assessmentId), eq(assessments.userId, userId)),
    )
    .limit(1);

  if (!row) {
    return { kind: "not_found" };
  }

  if (row.status !== "FAILED" && row.status !== "DRAFT") {
    return { kind: "invalid_status", status: row.status };
  }

  const context = await getOutcomeContextById(row.outcomeId);
  if (!context) {
    return { kind: "not_found" };
  }

  const skillRows = await listSkillsByOutcomeId(row.outcomeId);
  if (skillRows.length === 0) {
    return { kind: "not_found" };
  }

  await db
    .update(assessments)
    .set({
      status: "DRAFT",
      questionText: null,
      completedAt: null,
      overallScore: null,
    })
    .where(eq(assessments.id, assessmentId));

  await finishQuestionGeneration({
    assessmentId,
    context,
    skillNames: skillRows.map((skill) => skill.name),
  });

  return { kind: "regenerated", assessmentId };
}

async function finishQuestionGeneration({
  assessmentId,
  context,
  skillNames,
}: {
  assessmentId: number;
  context: Awaited<ReturnType<typeof getOutcomeContextById>>;
  skillNames: string[];
}): Promise<CreateAssessmentResult> {
  if (!context) {
    return { kind: "outcome_not_found" };
  }

  try {
    const questionText = await generateQuestion({
      functionName: context.functionName,
      roleName: context.roleName,
      subjectName: context.subjectName,
      outcomeDescription: context.outcomeDescription,
      skillNames,
    });

    await db
      .update(assessments)
      .set({
        questionText,
        status: "GENERATED",
      })
      .where(eq(assessments.id, assessmentId));

    return { kind: "created", assessmentId };
  } catch (error) {
    await db
      .update(assessments)
      .set({
        status: "FAILED",
        questionText: null,
      })
      .where(eq(assessments.id, assessmentId));

    logServerEvent("error", "assessment.generation_failed", {
      assessmentId,
      ...serializeError(error),
    });

    throw new AssessmentGenerationError(
      assessmentId,
      error,
      getGenerationFailureCode(error),
    );
  }
}
