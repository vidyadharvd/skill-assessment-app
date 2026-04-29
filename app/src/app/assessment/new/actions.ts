"use server";

import { redirect } from "next/navigation";

import { consumeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/auth/session";
import {
  AssessmentGenerationError,
  abandonAssessment,
  createAssessmentFromOutcome,
  type CreateAssessmentResult,
} from "@/lib/server/assessments";
import { logServerEvent, serializeError } from "@/lib/server/observability";

/**
 * Server action invoked by the wizard's Generate form.
 *
 * Inputs come in as FormData so we can keep the form server-rendered
 * with no client JS. Outputs are always a `redirect`:
 *   - `/assessment/[id]` on success or already-active
 *   - `/assessment/new?...&error=<code>` on any failure, preserving the
 *     user's existing selections so they don't have to re-click the
 *     entire cascade.
 */
export async function generateAssessmentAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();

  const rawFunction = formData.get("function");
  const rawRole = formData.get("role");
  const rawSubject = formData.get("subject");
  const rawOutcome = formData.get("outcome");

  const functionId = parsePositiveInt(rawFunction);
  const roleId = parsePositiveInt(rawRole);
  const subjectId = parsePositiveInt(rawSubject);
  const outcomeId = parsePositiveInt(rawOutcome);

  if (!functionId || !roleId || !subjectId || !outcomeId) {
    redirect(
      buildWizardError({ functionId, roleId, subjectId, outcomeId }, "missing_selection"),
    );
  }

  const userId = Number.parseInt(String(user.id), 10);
  if (!Number.isInteger(userId)) {
    redirect(
      buildWizardError(
        { functionId, roleId, subjectId, outcomeId },
        "invalid_session",
      ),
    );
  }

  const rateLimit = consumeRateLimit({
    key: `user:${userId}`,
    limit: 5,
    scope: "assessment-generate",
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    redirect(
      buildWizardError(
        { functionId, roleId, subjectId, outcomeId },
        "rate_limited",
      ),
    );
  }

  let result: CreateAssessmentResult;
  try {
    result = await createAssessmentFromOutcome({ userId, outcomeId });
  } catch (err) {
    logServerEvent("error", "assessment.generate_action_failed", {
      userId,
      outcomeId,
      ...serializeError(err),
    });

    if (err instanceof AssessmentGenerationError) {
      redirect(`/assessment/${err.assessmentId}?error=${err.code}`);
    }

    redirect(
      buildWizardError(
        { functionId, roleId, subjectId, outcomeId },
        "generation_failed",
      ),
    );
  }

  if (result.kind === "created" || result.kind === "active_exists") {
    redirect(`/assessment/${result.assessmentId}`);
  }

  redirect(
    buildWizardError({ functionId, roleId, subjectId, outcomeId }, result.kind),
  );
}

export async function discardAssessmentAction(
  assessmentId: number,
): Promise<void> {
  const user = await requireUser();
  const userId = Number.parseInt(String(user.id), 10);

  if (!Number.isInteger(userId)) {
    redirect("/assessment/new?error=invalid_session");
  }

  const result = await abandonAssessment({ assessmentId, userId });

  if (result.kind === "abandoned") {
    redirect("/assessment/new?discarded=1");
  }

  redirect(`/assessment/${assessmentId}?error=discard_not_allowed`);
}

function parsePositiveInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildWizardError(
  selection: {
    functionId: number | null;
    roleId: number | null;
    subjectId: number | null;
    outcomeId: number | null;
  },
  errorCode: string,
): string {
  const params = new URLSearchParams();
  if (selection.functionId)
    params.set("function", String(selection.functionId));
  if (selection.roleId) params.set("role", String(selection.roleId));
  if (selection.subjectId) params.set("subject", String(selection.subjectId));
  if (selection.outcomeId) params.set("outcome", String(selection.outcomeId));
  params.set("error", errorCode);
  return `/assessment/new?${params.toString()}`;
}
