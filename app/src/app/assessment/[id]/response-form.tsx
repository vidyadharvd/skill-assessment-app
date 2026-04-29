"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { MIN_RESPONSE_LENGTH } from "@/lib/assessment-constants";

import {
  INITIAL_SUBMIT_RESPONSE_FORM_STATE,
  type SubmitResponseFormState,
} from "./response-form-state";

type SubmitResponseAction = (
  state: SubmitResponseFormState,
  formData: FormData,
) => Promise<SubmitResponseFormState>;

type ResponseFormProps = {
  action: SubmitResponseAction;
};

export function ResponseForm({ action }: ResponseFormProps) {
  const [state, formAction] = useFormState(
    action,
    INITIAL_SUBMIT_RESPONSE_FORM_STATE,
  );
  const [value, setValue] = useState("");
  const trimmedLength = value.trim().length;
  const remaining = Math.max(0, MIN_RESPONSE_LENGTH - trimmedLength);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <label className="text-sm font-medium text-neutral-700" htmlFor="answer">
        Share how you would approach the scenario.
      </label>
      <textarea
        required
        id="answer"
        name="answer"
        minLength={MIN_RESPONSE_LENGTH}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="min-h-64 rounded-[1.5rem] border border-neutral-300 px-5 py-4 text-base leading-7 text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100"
        placeholder="Describe your approach, tradeoffs, and the concrete steps you would take."
      />
      <div className="flex flex-col gap-2 text-sm text-neutral-600 md:flex-row md:items-center md:justify-between">
        <p>
          Aim for a thoughtful, concrete response. Include decisions,
          assumptions, and how you would execute.
        </p>
        <p
          className={remaining === 0 ? "text-emerald-700" : "text-neutral-500"}
        >
          {remaining === 0
            ? "Minimum reached"
            : `${remaining} more characters required`}
        </p>
      </div>
      {state.error ? (
        <p className="text-sm font-medium text-rose-700">{state.error}</p>
      ) : null}
      <SubmitButton disabled={trimmedLength < MIN_RESPONSE_LENGTH} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center justify-center rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
    >
      {pending ? "Evaluating response..." : "Submit response"}
    </button>
  );
}
