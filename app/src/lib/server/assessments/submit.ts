import { and, eq } from "drizzle-orm";

import { MIN_RESPONSE_LENGTH } from "@/lib/assessment-constants";
import { db } from "@/lib/server/db/client";
import {
  assessmentSkills,
  assessments,
  responseSkillScores,
  responses,
} from "@/lib/server/db/schema";

export type SubmitAssessmentResponseInput = {
  assessmentId: number;
  userId: number;
  answerText: string;
};

export type SubmitAssessmentResponseResult =
  | {
      kind: "submitted";
      responseId: number;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "too_short";
    }
  | {
      kind: "already_submitted";
    }
  | {
      kind: "invalid_status";
      status:
        | "DRAFT"
        | "GENERATED"
        | "SUBMITTED"
        | "EVALUATING"
        | "COMPLETED"
        | "FAILED"
        | "ABANDONED";
    };

export async function submitAssessmentResponse({
  assessmentId,
  userId,
  answerText,
}: SubmitAssessmentResponseInput): Promise<SubmitAssessmentResponseResult> {
  const normalizedAnswer = answerText.trim();

  if (normalizedAnswer.length < MIN_RESPONSE_LENGTH) {
    return { kind: "too_short" };
  }

  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({
        id: assessments.id,
        status: assessments.status,
      })
      .from(assessments)
      .where(
        and(eq(assessments.id, assessmentId), eq(assessments.userId, userId)),
      )
      .limit(1);

    if (!assessment) {
      return { kind: "not_found" } satisfies SubmitAssessmentResponseResult;
    }

    if (assessment.status !== "GENERATED") {
      return {
        kind:
          assessment.status === "SUBMITTED" ||
          assessment.status === "EVALUATING" ||
          assessment.status === "COMPLETED"
            ? "already_submitted"
            : "invalid_status",
        status: assessment.status,
      } satisfies SubmitAssessmentResponseResult;
    }

    const [insertedResponse] = await tx
      .insert(responses)
      .values({
        assessmentId,
        answerText: normalizedAnswer,
      })
      .onConflictDoNothing()
      .returning({ id: responses.id });

    if (!insertedResponse) {
      return {
        kind: "already_submitted",
      } satisfies SubmitAssessmentResponseResult;
    }

    const skillRows = await tx
      .select({
        skillId: assessmentSkills.skillId,
      })
      .from(assessmentSkills)
      .where(eq(assessmentSkills.assessmentId, assessmentId));

    if (skillRows.length === 0) {
      throw new Error(
        `Assessment ${assessmentId} has no snapshotted skills to evaluate.`,
      );
    }

    await tx.insert(responseSkillScores).values(
      skillRows.map((skill) => ({
        responseId: insertedResponse.id,
        skillId: skill.skillId,
        status: "PENDING" as const,
      })),
    );

    await tx
      .update(assessments)
      .set({ status: "SUBMITTED" })
      .where(eq(assessments.id, assessmentId));

    return {
      kind: "submitted",
      responseId: insertedResponse.id,
    } satisfies SubmitAssessmentResponseResult;
  });
}
