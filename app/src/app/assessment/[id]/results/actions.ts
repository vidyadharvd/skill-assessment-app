"use server";

import { redirect } from "next/navigation";

import { consumeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/auth/session";
import { retryFailedAssessmentEvaluationForUser } from "@/lib/server/assessments";
import { logServerEvent, serializeError } from "@/lib/server/observability";

export async function retryFailedSkillsAction(
  assessmentId: number,
): Promise<void> {
  const user = await requireUser();
  const userId = Number.parseInt(String(user.id), 10);

  if (!Number.isInteger(userId)) {
    redirect(`/assessment/${assessmentId}/results?error=invalid_session`);
  }

  const rateLimit = consumeRateLimit({
    key: `user:${userId}`,
    limit: 5,
    scope: "assessment-retry-failed-skills",
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    redirect(`/assessment/${assessmentId}/results?error=rate_limited`);
  }

  try {
    const result = await retryFailedAssessmentEvaluationForUser({
      assessmentId,
      userId,
    });

    if (result.kind === "retried") {
      redirect(`/assessment/${assessmentId}/results?retried=1`);
    }

    if (result.kind === "no_failed_skills") {
      redirect(`/assessment/${assessmentId}/results?error=no_failed_skills`);
    }

    redirect(`/assessment/${assessmentId}/results?error=retry_not_allowed`);
  } catch (error) {
    logServerEvent("error", "assessment.retry_failed_skills_action_failed", {
      assessmentId,
      userId,
      ...serializeError(error),
    });
    redirect(`/assessment/${assessmentId}/results?error=retry_failed`);
  }
}
