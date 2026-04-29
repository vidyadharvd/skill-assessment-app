/**
 * `generateQuestion` — produce a single scenario-based question that
 * implicitly covers a list of skills for an outcome.
 *
 * Pure function: takes context + skills, returns text. Does **not** persist
 * anything. The orchestrator in `/lib/server/assessments` writes the
 * `assessments` row and the snapshot.
 */

import { z } from "zod";

import { callStructured, type JsonSchema } from "@/lib/server/llm";

import {
  QUESTION_SYSTEM_PROMPT,
  buildQuestionUserPrompt,
  type QuestionPromptInput,
} from "./prompt";

// Tool input schema (validated by Zod after the LLM returns).
const QuestionToolInput = z.object({
  question: z
    .string()
    .trim()
    .min(80, "question is too short")
    .max(2000, "question is too long"),
});

// Mirror of the Zod schema as JSON Schema, for OpenAI's structured-output
// `response_format`. Kept hand-written to avoid a heavyweight
// zod-to-json-schema dependency. Must satisfy strict mode:
// `additionalProperties: false` + every property in `required`.
const QuestionToolJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    question: {
      type: "string",
      minLength: 80,
      maxLength: 2000,
      description:
        "The full text of the scenario-based question to present to the candidate.",
    },
  },
  required: ["question"],
  additionalProperties: false,
};

export type GenerateQuestionInput = QuestionPromptInput;

/**
 * Returns the generated question text. Throws via the LLM module on
 * request/timeout/validation failures — caller decides how to surface that.
 */
export async function generateQuestion(
  input: GenerateQuestionInput,
): Promise<string> {
  if (input.skillNames.length === 0) {
    throw new Error(
      "generateQuestion requires at least one skill — outcome has no mapped skills.",
    );
  }

  const result = await callStructured({
    schema: QuestionToolInput,
    jsonSchema: QuestionToolJsonSchema,
    toolName: "question_payload",
    toolDescription:
      "The single scenario-based question to present to the candidate.",
    system: QUESTION_SYSTEM_PROMPT,
    user: buildQuestionUserPrompt(input),
  });

  return result.question;
}
