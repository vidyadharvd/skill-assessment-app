"use server";

import { redirect } from "next/navigation";

import { MIN_RESPONSE_LENGTH } from "@/lib/assessment-constants";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/auth/session";
import {
  retryAssessmentGeneration,
  runAssessmentEvaluation,
  submitAssessmentResponse,
} from "@/lib/server/assessments";
import { logServerEvent, serializeError } from "@/lib/server/observability";

import { type SubmitResponseFormState } from "./response-form-state";

export async function submitResponseAction(
  assessmentId: number,
  _previousState: SubmitResponseFormState,
  formData: FormData,
): Promise<SubmitResponseFormState> {
  const user = await requireUser();
  const userId = Number.parseInt(String(user.id), 10);

  if (!Number.isInteger(userId)) {
    return { error: "Your session is invalid. Please sign in again." };
  }

  const rateLimit = consumeRateLimit({
    key: `user:${userId}`,
    limit: 5,
    scope: "assessment-submit",
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return {
      error: `You've hit the submission limit. Please wait ${rateLimit.retryAfterSeconds} seconds and try again.`,
    };
  }

  const rawAnswer = formData.get("answer");
  if (typeof rawAnswer !== "string") {
    return {
      error: `Response must be at least ${MIN_RESPONSE_LENGTH} characters.`,
    };
  }

  const result = await submitAssessmentResponse({
    assessmentId,
    userId,
    answerText: rawAnswer,
  });

  switch (result.kind) {
    case "submitted":
      try {
        await runAssessmentEvaluation({
          assessmentId,
          responseId: result.responseId,
        });
        redirect(`/assessment/${assessmentId}/results?submitted=1`);
      } catch (error) {
        logServerEvent("error", "assessment.submit_evaluation_failed", {
          assessmentId,
          responseId: result.responseId,
          userId,
          ...serializeError(error),
        });
        redirect(`/assessment/${assessmentId}/results?error=evaluation_failed`);
      }
    case "too_short":
      return {
        error: `Response must be at least ${MIN_RESPONSE_LENGTH} characters.`,
      };
    case "already_submitted":
      redirect(`/assessment/${assessmentId}?error=already_submitted`);
    case "not_found":
      redirect(`/assessment/${assessmentId}?error=not_found`);
    case "invalid_status":
      return {
        error:
          result.status === "ABANDONED"
            ? "This assessment has been abandoned and can’t accept a response."
            : "This assessment can’t accept a response in its current state.",
      };
  }
}

export async function retryGenerationAction(
  assessmentId: number,
): Promise<void> {
  const user = await requireUser();
  const userId = Number.parseInt(String(user.id), 10);

  if (!Number.isInteger(userId)) {
    redirect(`/assessment/${assessmentId}?error=invalid_session`);
  }

  const rateLimit = consumeRateLimit({
    key: `user:${userId}`,
    limit: 5,
    scope: "assessment-generate",
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    redirect(`/assessment/${assessmentId}?error=rate_limited`);
  }

  try {
    const result = await retryAssessmentGeneration({ assessmentId, userId });

    if (result.kind === "regenerated") {
      redirect(`/assessment/${assessmentId}?regenerated=1`);
    }

    redirect(`/assessment/${assessmentId}?error=generation_failed`);
  } catch (error) {
    logServerEvent("error", "assessment.retry_generation_failed", {
      assessmentId,
      userId,
      ...serializeError(error),
    });
    redirect(`/assessment/${assessmentId}?error=generation_failed`);
  }
}
