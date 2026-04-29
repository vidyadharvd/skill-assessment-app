import Link from "next/link";

import { PendingButton } from "@/components/pending-button";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser } from "@/lib/server/auth/session";
import { findActiveAssessmentForUser } from "@/lib/server/assessments";
import {
  getFunctionById,
  getOutcomeById,
  getRoleById,
  getSubjectById,
  listFunctions,
  listOutcomesBySubjectId,
  listRolesByFunctionId,
  listSubjectsByRoleId,
  type TaxonomyOption,
} from "@/lib/server/taxonomy/queries";

import {
  discardAssessmentAction,
  generateAssessmentAction,
} from "./actions";

type SearchParams = {
  discarded?: string;
  error?: string;
  function?: string;
  outcome?: string;
  role?: string;
  subject?: string;
};

const ERROR_COPY: Record<string, string> = {
  missing_selection:
    "Please pick a function, role, subject, and outcome before generating.",
  invalid_session:
    "Your session looks malformed. Please sign out and sign back in.",
  outcome_not_found:
    "We couldn't find that outcome anymore. Pick another from the list.",
  no_skills_mapped:
    "This outcome has no skills mapped yet, so we can't build a question for it.",
  rate_limited:
    "You've hit the generation limit for the last minute. Please wait a moment and try again.",
  generation_request_failed:
    "Something went wrong reaching the LLM. Try again in a moment.",
  generation_invalid_output:
    "The model returned an unusable response. Try again.",
  generation_failed: "We couldn't generate your assessment. Try again.",
};

type PageProps = {
  searchParams?: SearchParams;
};

function parsePositiveInt(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildWizardHref(selection: {
  functionId?: number | null;
  outcomeId?: number | null;
  roleId?: number | null;
  subjectId?: number | null;
}) {
  const params = new URLSearchParams();

  if (selection.functionId) {
    params.set("function", String(selection.functionId));
  }

  if (selection.roleId) {
    params.set("role", String(selection.roleId));
  }

  if (selection.subjectId) {
    params.set("subject", String(selection.subjectId));
  }

  if (selection.outcomeId) {
    params.set("outcome", String(selection.outcomeId));
  }

  const query = params.toString();

  return query ? `/assessment/new?${query}` : "/assessment/new";
}

function StepSection({
  activeId,
  field,
  description,
  emptyState,
  options,
  selectedTrail,
  stepLabel,
  title,
}: {
  activeId: number | null;
  field: "function" | "role" | "subject" | "outcome";
  description: string;
  emptyState: string;
  options: TaxonomyOption[];
  selectedTrail: {
    functionId?: number | null;
    outcomeId?: number | null;
    roleId?: number | null;
    subjectId?: number | null;
  };
  stepLabel: string;
  title: string;
}) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
        {stepLabel}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-neutral-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
      <div className="mt-5 flex flex-col gap-3">
        {options.length > 0 ? (
          options.map((option) => {
            const href = buildWizardHref({
              functionId:
                field === "function"
                  ? option.id
                  : (selectedTrail.functionId ?? null),
              outcomeId:
                field === "outcome"
                  ? option.id
                  : (selectedTrail.outcomeId ?? null),
              roleId:
                field === "role" ? option.id : (selectedTrail.roleId ?? null),
              subjectId:
                field === "subject"
                  ? option.id
                  : (selectedTrail.subjectId ?? null),
            });

            return (
              <Link
                className={`rounded-2xl border px-4 py-4 text-sm transition ${
                  option.id === activeId
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50"
                }`}
                href={href}
                key={option.id}
              >
                {option.label}
              </Link>
            );
          })
        ) : (
          <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-4 text-sm text-neutral-500">
            {emptyState}
          </p>
        )}
      </div>
    </section>
  );
}

export default async function NewAssessmentPage({ searchParams }: PageProps) {
  const user = await requireUser();

  const selectedFunctionId = parsePositiveInt(searchParams?.function);
  const selectedRoleId = parsePositiveInt(searchParams?.role);
  const selectedSubjectId = parsePositiveInt(searchParams?.subject);
  const selectedOutcomeId = parsePositiveInt(searchParams?.outcome);
  const errorCode = searchParams?.error;
  const errorMessage = errorCode ? ERROR_COPY[errorCode] : null;
  const discarded = searchParams?.discarded === "1";

  // Surface any in-flight assessment so the user can resume rather than
  // having Generate silently bounce them mid-cascade (see UX §4).
  const userIdNumber = Number.parseInt(String(user.id), 10);
  const activeAssessment = Number.isInteger(userIdNumber)
    ? await findActiveAssessmentForUser(userIdNumber)
    : null;

  const functionOptions = await listFunctions();
  const selectedFunction = selectedFunctionId
    ? await getFunctionById(selectedFunctionId)
    : null;

  const roleOptions = selectedFunction
    ? await listRolesByFunctionId(selectedFunction.id)
    : [];
  const selectedRole =
    selectedFunction && selectedRoleId
      ? await getRoleById(selectedRoleId, selectedFunction.id)
      : null;

  const subjectOptions = selectedRole
    ? await listSubjectsByRoleId(selectedRole.id)
    : [];
  const selectedSubject =
    selectedRole && selectedSubjectId
      ? await getSubjectById(selectedSubjectId, selectedRole.id)
      : null;

  const outcomeOptions = selectedSubject
    ? await listOutcomesBySubjectId(selectedSubject.id)
    : [];
  const selectedOutcome =
    selectedSubject && selectedOutcomeId
      ? await getOutcomeById(selectedOutcomeId, selectedSubject.id)
      : null;

  const canGenerate =
    !!selectedFunction &&
    !!selectedRole &&
    !!selectedSubject &&
    !!selectedOutcome;
  const canDiscardActiveAssessment =
    activeAssessment?.status === "DRAFT" ||
    activeAssessment?.status === "GENERATED";

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        {discarded ? (
          <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm">
            The previous assessment was marked as abandoned. You can start a
            fresh one now.
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Assessment Flow
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950">
                Choose what you want to be assessed on
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
                Signed in as {user.name ?? user.email}. Pick a function → role →
                subject → outcome, then generate a scenario question tailored
                to all the skills mapped to that outcome.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-100"
                href="/"
              >
                Back to home
              </Link>
              <SignOutButton />
            </div>
          </div>
        </section>

        {activeAssessment ? (
          <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-900">
              Assessment in progress
            </p>
            <h2 className="mt-2 text-lg font-semibold text-amber-950">
              You already have an active assessment
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
              Pick up where you left off. If you want a fresh start, discard
              the unfinished assessment first.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center rounded-full bg-amber-900 px-5 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-800"
                href={`/assessment/${activeAssessment.id}`}
              >
                Resume assessment
              </Link>
              {canDiscardActiveAssessment ? (
                <form
                  action={discardAssessmentAction.bind(null, activeAssessment.id)}
                >
                  <PendingButton
                    className="inline-flex items-center rounded-full border border-amber-400 px-5 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
                    idleLabel="Discard and start fresh"
                    pendingLabel="Discarding..."
                  />
                </form>
              ) : null}
            </div>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-900">
            {errorMessage}
          </section>
        ) : null}

        <section className="grid gap-4 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm md:grid-cols-4">
          <div className="rounded-2xl bg-neutral-100 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Function
            </p>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {selectedFunction?.label ?? "Not selected"}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-100 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Role
            </p>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {selectedRole?.label ?? "Not selected"}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-100 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Subject
            </p>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {selectedSubject?.label ?? "Not selected"}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-100 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Outcome
            </p>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {selectedOutcome?.label ?? "Not selected"}
            </p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <StepSection
            activeId={selectedFunction?.id ?? null}
            description="Start with the broad work domain that anchors the rest of the flow."
            emptyState="No functions available yet."
            field="function"
            options={functionOptions}
            selectedTrail={{}}
            stepLabel="Step 1"
            title="Select Function"
          />

          <StepSection
            activeId={selectedRole?.id ?? null}
            description="Roles are filtered by the function you selected."
            emptyState="Pick a function first to unlock roles."
            field="role"
            options={roleOptions}
            selectedTrail={{
              functionId: selectedFunction?.id ?? null,
            }}
            stepLabel="Step 2"
            title="Select Role"
          />

          <StepSection
            activeId={selectedSubject?.id ?? null}
            description="Subjects narrow the assessment to a focused capability area."
            emptyState="Pick a role first to unlock subjects."
            field="subject"
            options={subjectOptions}
            selectedTrail={{
              functionId: selectedFunction?.id ?? null,
              roleId: selectedRole?.id ?? null,
            }}
            stepLabel="Step 3"
            title="Select Subject"
          />

          <StepSection
            activeId={selectedOutcome?.id ?? null}
            description="Outcomes are the final measurable goal we’ll use for question generation later."
            emptyState="Pick a subject first to unlock outcomes."
            field="outcome"
            options={outcomeOptions.map((option) => ({
              ...option,
              label: option.label,
            }))}
            selectedTrail={{
              functionId: selectedFunction?.id ?? null,
              outcomeId: selectedOutcome?.id ?? null,
              roleId: selectedRole?.id ?? null,
              subjectId: selectedSubject?.id ?? null,
            }}
            stepLabel="Step 4"
            title="Select Outcome"
          />
        </div>

        <section className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Generate
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-neutral-950">
            Generate Assessment
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
            {canGenerate
              ? "Your selections are complete. Click generate to write your scenario question — this can take 5–15 seconds while the model thinks."
              : "Complete all four selections to unlock the generate action."}
          </p>
          <form
            action={generateAssessmentAction}
            className="mt-6 flex flex-wrap items-center gap-3"
          >
            <input
              type="hidden"
              name="function"
              value={selectedFunction?.id ?? ""}
            />
            <input
              type="hidden"
              name="role"
              value={selectedRole?.id ?? ""}
            />
            <input
              type="hidden"
              name="subject"
              value={selectedSubject?.id ?? ""}
            />
            <input
              type="hidden"
              name="outcome"
              value={selectedOutcome?.id ?? ""}
            />
            <PendingButton
              className={`rounded-full px-5 py-3 text-sm font-medium transition ${
                canGenerate
                  ? "bg-neutral-950 text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                  : "cursor-not-allowed bg-neutral-200 text-neutral-500"
              }`}
              disabled={!canGenerate}
              idleLabel="Generate Assessment"
              pendingLabel="Generating question..."
            />
            <Link
              className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-100"
              href="/assessment/new"
            >
              Reset selections
            </Link>
          </form>
        </section>
      </div>
    </main>
  );
}
