import Link from "next/link";
import { notFound } from "next/navigation";

import { PendingButton } from "@/components/pending-button";
import { SignOutButton } from "@/components/sign-out-button";
import { getAssessmentResultsForUser } from "@/lib/server/assessments";
import { requireUser } from "@/lib/server/auth/session";

import { retryFailedSkillsAction } from "./actions";

type PageProps = {
  params: { id: string };
  searchParams?: {
    error?: string;
    retried?: string;
    submitted?: string;
  };
};

const STATUS_COPY: Record<
  | "DRAFT"
  | "GENERATED"
  | "SUBMITTED"
  | "EVALUATING"
  | "COMPLETED"
  | "FAILED"
  | "ABANDONED",
  { label: string; tone: "neutral" | "amber" | "green" | "rose" }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  GENERATED: { label: "Question ready", tone: "neutral" },
  SUBMITTED: { label: "Response submitted", tone: "amber" },
  EVALUATING: { label: "Evaluating", tone: "amber" },
  COMPLETED: { label: "Completed", tone: "green" },
  FAILED: { label: "Failed", tone: "rose" },
  ABANDONED: { label: "Abandoned", tone: "neutral" },
};

const TONE_CLASSES = {
  neutral: "bg-neutral-100 text-neutral-700",
  amber: "bg-amber-100 text-amber-900",
  green: "bg-emerald-100 text-emerald-900",
  rose: "bg-rose-100 text-rose-900",
};

const PAGE_ERROR_COPY: Record<string, string> = {
  evaluation_failed:
    "The response was saved, but the evaluation run did not finish cleanly.",
  invalid_session:
    "Your session looks invalid. Please sign in again.",
  no_failed_skills: "There are no failed skills left to retry.",
  rate_limited:
    "You've hit the retry limit for the last minute. Please wait a moment and try again.",
  retry_failed: "We couldn't retry the failed skills right now.",
  retry_not_allowed:
    "Retry failed skills is only available when this assessment has failed skill scores.",
};

export default async function AssessmentResultsPage({
  params,
  searchParams,
}: PageProps) {
  const user = await requireUser();
  const userId = Number.parseInt(String(user.id), 10);
  const assessmentId = Number.parseInt(params.id, 10);

  if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
    notFound();
  }

  if (!Number.isInteger(userId)) {
    notFound();
  }

  const assessment = await getAssessmentResultsForUser(assessmentId, userId);
  if (!assessment) {
    notFound();
  }

  const statusMeta = STATUS_COPY[assessment.status];
  const breadcrumb = [
    assessment.context.functionName,
    assessment.context.roleName,
    assessment.context.subjectName,
  ].join(" › ");
  const scoredCount = assessment.skillScores.filter(
    (skill) => skill.status === "SCORED",
  ).length;
  const failedCount = assessment.skillScores.filter(
    (skill) => skill.status === "FAILED",
  ).length;
  const canRetryFailedSkills =
    assessment.status === "FAILED" && failedCount > 0;
  const pageError = searchParams?.error
    ? PAGE_ERROR_COPY[searchParams.error]
    : null;
  const retried = searchParams?.retried === "1";
  const submitted = searchParams?.submitted === "1";
  const retryAction = retryFailedSkillsAction.bind(null, assessment.id);

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {retried ? (
          <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm">
            Failed skills were retried. Refreshing this page later will show
            any newly completed scores.
          </section>
        ) : null}

        {submitted ? (
          <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm">
            {assessment.status === "COMPLETED"
              ? "Your response was saved and evaluated successfully."
              : "Your response was saved. Evaluation is still being finalized."}
          </section>
        ) : null}

        {pageError ? (
          <section className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900 shadow-sm">
            {pageError}
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Results for Assessment #{assessment.id}
              </p>
              <p className="mt-2 text-sm text-neutral-600">{breadcrumb}</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
                {assessment.context.outcomeDescription}
              </h1>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${TONE_CLASSES[statusMeta.tone]}`}
            >
              {statusMeta.label}
            </span>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_1.95fr]">
          <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Overall score
            </p>
            <div className="mt-6 flex items-end gap-4">
              <p className="text-5xl font-semibold tracking-tight text-neutral-950">
                {assessment.overallScore !== null
                  ? assessment.overallScore.toFixed(2)
                  : "—"}
              </p>
              <p className="pb-2 text-sm text-neutral-500">out of 5.00</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              {buildSummaryCopy(assessment.status, scoredCount, assessment.skillScores.length)}
            </p>
            {canRetryFailedSkills ? (
              <form action={retryAction} className="mt-5">
                <PendingButton
                  className="inline-flex items-center rounded-full bg-rose-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300"
                  idleLabel="Retry failed skills only"
                  pendingLabel="Retrying failed skills..."
                />
              </form>
            ) : null}
          </section>

          <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Skill breakdown
                </p>
                <h2 className="mt-2 text-xl font-semibold text-neutral-950">
                  Scored one skill at a time
                </h2>
              </div>
              <p className="text-sm text-neutral-500">
                {scoredCount}/{assessment.skillScores.length} scored
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-5">
              {assessment.skillScores.map((skill) => {
                const value = skill.score ?? 0;
                const width = `${(value / 5) * 100}%`;

                return (
                  <article
                    className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5"
                    key={skill.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-neutral-950">
                          {skill.name}
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                          {formatSkillStatus(skill.status, skill.score)}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-neutral-700">
                        {skill.score !== null ? `${skill.score}/5` : "Pending"}
                      </p>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200">
                      <div
                        className={`h-full rounded-full ${
                          skill.status === "FAILED"
                            ? "bg-rose-400"
                            : skill.status === "SCORED"
                              ? "bg-neutral-950"
                              : "bg-amber-400"
                        }`}
                        style={{ width: skill.status === "FAILED" ? "100%" : width }}
                      />
                    </div>

                    {skill.justificationText ? (
                      <details className="mt-4 rounded-[1.25rem] border border-neutral-200 bg-white px-4 py-3">
                        <summary className="cursor-pointer list-none text-sm font-medium text-neutral-900">
                          View justification
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                          {skill.justificationText}
                        </p>
                      </details>
                    ) : null}

                    {skill.errorText ? (
                      <p className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                        {skill.errorText}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Scenario
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-800">
              {assessment.questionText ?? "No question text was captured for this assessment yet."}
            </p>
          </section>

          <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Submitted response
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-800">
              {assessment.responseText ?? "No response has been saved for this assessment yet."}
            </p>
          </section>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            href={`/assessment/${assessment.id}`}
          >
            Back to assessment
          </Link>
          <Link
            className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-100"
            href="/"
          >
            Home
          </Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}

function buildSummaryCopy(
  status: PageProps["searchParams"] extends never
    ? never
    : "DRAFT" | "GENERATED" | "SUBMITTED" | "EVALUATING" | "COMPLETED" | "FAILED" | "ABANDONED",
  scoredCount: number,
  totalCount: number,
): string {
  if (status === "COMPLETED") {
    return `All ${totalCount} skills have been scored. Expand any row to read the evaluator's reasoning.`;
  }

  if (status === "FAILED") {
    return `${scoredCount} of ${totalCount} skills were scored before evaluation stopped.`;
  }

  if (status === "EVALUATING" || status === "SUBMITTED") {
    return `The evaluator is still working through this response. ${scoredCount} of ${totalCount} skills are ready so far.`;
  }

  return "This assessment has not produced final results yet.";
}

function formatSkillStatus(
  status: "PENDING" | "SCORED" | "FAILED",
  score: number | null,
): string {
  if (status === "SCORED" && score !== null) {
    return score >= 4
      ? "Strong evidence in this skill."
      : score >= 2
        ? "Partial evidence in this skill."
        : "Limited evidence in this skill.";
  }

  if (status === "FAILED") {
    return "This skill could not be scored.";
  }

  return "Waiting for evaluation.";
}
