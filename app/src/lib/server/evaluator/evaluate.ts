import { z } from "zod";

import { callStructured, type JsonSchema } from "@/lib/server/llm";
import type { SkillRubric } from "@/lib/server/rubrics";

import {
  buildEvaluationUserPrompt,
  EVALUATION_SYSTEM_PROMPT,
  type EvaluationPromptInput,
} from "./prompt";

const EvaluationResultSchema = z.object({
  score: z.number().int().min(0).max(5),
  justification: z.string().trim().min(12).max(600),
});

const EvaluationResultJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 5,
      description: "The rubric-based integer score for this skill.",
    },
    justification: {
      type: "string",
      minLength: 12,
      maxLength: 600,
      description:
        "A short explanation grounded in the response and the rubric.",
    },
  },
  required: ["score", "justification"],
  additionalProperties: false,
};

export type EvaluateSkillInput = EvaluationPromptInput & {
  rubric: SkillRubric;
};

export type EvaluateSkillResult = z.infer<typeof EvaluationResultSchema>;

export async function evaluateSkill(
  input: EvaluateSkillInput,
): Promise<EvaluateSkillResult> {
  return callStructured({
    schema: EvaluationResultSchema,
    jsonSchema: EvaluationResultJsonSchema,
    toolName: "skill_evaluation_payload",
    toolDescription:
      "The rubric-based score and brief justification for one skill.",
    system: EVALUATION_SYSTEM_PROMPT,
    user: buildEvaluationUserPrompt(input),
    maxTokens: 600,
  });
}
