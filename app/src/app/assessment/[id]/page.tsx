import Link from "next/link";
import { notFound } from "next/navigation";

import { PendingButton } from "@/components/pending-button";
import { SignOutButton } from "@/components/sign-out-button";
import { getAssessmentForUser } from "@/lib/server/assessments";
import { requireUser } from "@/lib/server/auth/session";

import { discardAssessmentAction } from "../new/actions";
import {
  retryGenerationAction,
  submitResponseAction,
} from "./actions";
import { ResponseForm } from "./response-form";

type PageProps = {
  params: { id: string };
  searchParams?: {
    regenerated?: string;
    submitted?: string;
    error?: string;
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
  GENERATED: { label: "Question ready", tone: "amber" },
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
  already_submitted:
    "This response was already submitted. Evaluation will continue from the saved version.",
  discard_not_allowed:
    "This assessment can no longer be discarded because work has already been submitted.",
  evaluation_failed:
    "The response was saved, but the evaluation run did not finish cleanly. Open results to inspect any partial scoring.",
  generation_failed: "Failed to generate question.",
  generation_invalid_output: "Failed to generate question.",
  generation_request_failed: "Failed to generate question.",
  not_found: "We couldn't find that assessment for your account.",
  rate_limited:
    "You've hit the action limit for the last minute. Please wait a moment and try again.",
};

export default async function AssessmentDetailPage({
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

  const assessment = await getAssessmentForUser(assessmentId, userId);
  if (!assessment) {
    notFound();
  }

  const statusMeta = STATUS_COPY[assessment.status];
  const breadcrumb = [
    assessment.context.functionName,
    assessment.context.roleName,
    assessment.context.subjectName,
  ].join(" › ");
  const responseAction = submitResponseAction.bind(null, assessment.id);
  const pageError = searchParams?.error
    ? PAGE_ERROR_COPY[searchParams.error]
    : null;
  const regenerated = searchParams?.regenerated === "1";
  const submitted = searchParams?.submitted === "1";
  const discardAction = discardAssessmentAction.bind(null, assessment.id);
  const retryAction = retryGenerationAction.bind(null, assessment.id);
  const generationFailed =
    assessment.status === "FAILED" &&
    !assessment.questionText &&
    !assessment.responseText;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {regenerated ? (
          <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm">
            The question was regenerated successfully. You can continue with
            your response now.
          </section>
        ) : null}

        {submitted ? (
          <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm">
            Your response has been saved and the evaluation pipeline has run for
            this assessment.
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
                Assessment #{assessment.id}
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

        <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            Scenario
          </p>
          {assessment.questionText ? (
            <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-neutral-900">
              {assessment.questionText}
            </p>
          ) : generationFailed ? (
            <div className="mt-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
              <p>
                We couldn&apos;t generate the question for this assessment yet.
              </p>
              <p className="mt-2">
                Retry will reuse this same assessment record and try question
                generation again.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <form action={retryAction}>
                  <PendingButton
                    className="inline-flex items-center rounded-full bg-rose-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300"
                    idleLabel="Retry generation"
                    pendingLabel="Generating question..."
                  />
                </form>
                <form action={discardAction}>
                  <PendingButton
                    className="inline-flex items-center rounded-full border border-rose-300 px-5 py-3 text-sm font-medium text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                    idleLabel="Discard assessment"
                    pendingLabel="Discarding..."
                  />
                </form>
              </div>
            </div>
          ) : assessment.status === "DRAFT" ? (
            <p className="mt-4 text-sm text-neutral-500">
              Generating question...
            </p>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">
              No question text yet. If this assessment was just generated, give
              it a moment and refresh.
            </p>
          )}
        </section>

        <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            Skills evaluated
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {assessment.skills.map((skill) => (
              <li
                key={skill.id}
                className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700"
              >
                {skill.name}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Response
          </p>
          {assessment.status === "GENERATED" ? (
            <>
              <h2 className="mt-3 text-xl font-semibold text-neutral-950">
                Submit your response
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
                Write one detailed response to the scenario above. We’ll score
                the same answer across each mapped skill.
              </p>
              <ResponseForm action={responseAction} />
              <form action={discardAction} className="mt-4">
                <PendingButton
                  className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70"
                  idleLabel="Discard assessment"
                  pendingLabel="Discarding..."
                />
              </form>
            </>
          ) : assessment.responseText ? (
            <>
              <h2 className="mt-3 text-xl font-semibold text-neutral-950">
                Response saved
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
                This assessment is no longer accepting edits. Here’s the
                submitted response currently attached to it.
              </p>
              <div className="mt-4 rounded-[1.5rem] bg-neutral-50 px-5 py-4">
                <p className="whitespace-pre-wrap text-base leading-7 text-neutral-900">
                  {assessment.responseText}
                </p>
              </div>
            </>
          ) : (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
              This assessment can’t accept a response in its current state.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-100"
              href="/"
            >
              Back to home
            </Link>
            {assessment.status !== "GENERATED" && !generationFailed ? (
              <Link
                className="inline-flex items-center rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
                href={`/assessment/${assessment.id}/results`}
              >
                View results
              </Link>
            ) : null}
            <SignOutButton />
          </div>
        </section>
      </div>
    </main>
  );
}
