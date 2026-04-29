import { and, eq } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import { assessments, responses } from "@/lib/server/db/schema";

type MutableAssessmentStatus =
  | "DRAFT"
  | "GENERATED"
  | "SUBMITTED"
  | "EVALUATING"
  | "COMPLETED"
  | "FAILED"
  | "ABANDONED";

export async function abandonAssessment({
  assessmentId,
  userId,
}: {
  assessmentId: number;
  userId: number;
}): Promise<
  | { kind: "abandoned" }
  | { kind: "not_found" }
  | { kind: "invalid_status"; status: MutableAssessmentStatus }
> {
  const [row] = await db
    .select({
      id: assessments.id,
      status: assessments.status,
      responseId: responses.id,
    })
    .from(assessments)
    .leftJoin(responses, eq(responses.assessmentId, assessments.id))
    .where(
      and(eq(assessments.id, assessmentId), eq(assessments.userId, userId)),
    )
    .limit(1);

  if (!row) {
    return { kind: "not_found" };
  }

  const canAbandon =
    (row.status === "DRAFT" ||
      row.status === "GENERATED" ||
      row.status === "FAILED") &&
    row.responseId === null;

  if (!canAbandon) {
    return {
      kind: "invalid_status",
      status: row.status,
    };
  }

  await db
    .update(assessments)
    .set({
      status: "ABANDONED",
      completedAt: null,
      overallScore: null,
    })
    .where(eq(assessments.id, assessmentId));

  return { kind: "abandoned" };
}
