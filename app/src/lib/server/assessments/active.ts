/**
 * Active-assessment lookup.
 *
 * Per UX §4: a user may have at most one active assessment at a time, where
 * "active" means status ∈ {DRAFT, GENERATED, SUBMITTED, EVALUATING}.
 *
 * The wizard uses this to short-circuit a duplicate Generate click —
 * instead of erroring, we route the user to the assessment they already
 * have in flight.
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import { assessments } from "@/lib/server/db/schema";

export const ACTIVE_ASSESSMENT_STATUSES = [
  "DRAFT",
  "GENERATED",
  "SUBMITTED",
  "EVALUATING",
] as const;

export type ActiveAssessment = {
  id: number;
  status: (typeof ACTIVE_ASSESSMENT_STATUSES)[number];
};

export async function findActiveAssessmentForUser(
  userId: number,
): Promise<ActiveAssessment | null> {
  const [row] = await db
    .select({
      id: assessments.id,
      status: assessments.status,
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.userId, userId),
        inArray(assessments.status, [...ACTIVE_ASSESSMENT_STATUSES]),
      ),
    )
    .orderBy(desc(assessments.createdAt))
    .limit(1);

  if (!row) {
    return null;
  }

  return row as ActiveAssessment;
}
