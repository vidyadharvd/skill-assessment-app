import { z } from "zod";

import { callStructured, type JsonSchema } from "@/lib/server/llm";

import {
  buildRubricUserPrompt,
  RUBRIC_SYSTEM_PROMPT,
  type RubricPromptInput,
} from "./prompt";

const RubricScale = z.object({
  "0": z.string().trim().min(5).max(160),
  "1": z.string().trim().min(5).max(160),
  "2": z.string().trim().min(5).max(160),
  "3": z.string().trim().min(5).max(160),
  "4": z.string().trim().min(5).max(160),
  "5": z.string().trim().min(5).max(160),
});

export const SkillRubricSchema = z.object({
  skill: z.string().trim().min(1).max(200),
  criteria: z.array(z.string().trim().min(10).max(220)).min(1).max(3),
  scale: RubricScale,
  scoring_instructions: z
    .array(z.string().trim().min(8).max(220))
    .min(3)
    .max(5),
});

const SkillRubricJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    skill: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "The exact skill name this rubric evaluates.",
    },
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "string",
        minLength: 10,
        maxLength: 220,
      },
      description:
        "Observable criteria describing what strong performance looks like for this skill.",
    },
    scale: {
      type: "object",
      properties: {
        "0": { type: "string", minLength: 5, maxLength: 160 },
        "1": { type: "string", minLength: 5, maxLength: 160 },
        "2": { type: "string", minLength: 5, maxLength: 160 },
        "3": { type: "string", minLength: 5, maxLength: 160 },
        "4": { type: "string", minLength: 5, maxLength: 160 },
        "5": { type: "string", minLength: 5, maxLength: 160 },
      },
      required: ["0", "1", "2", "3", "4", "5"],
      additionalProperties: false,
      description: "Meaning of each integer score from 0 through 5.",
    },
    scoring_instructions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "string",
        minLength: 8,
        maxLength: 220,
      },
      description:
        "Brief instructions the evaluator should follow when scoring this skill.",
    },
  },
  required: ["skill", "criteria", "scale", "scoring_instructions"],
  additionalProperties: false,
};

export type SkillRubric = z.infer<typeof SkillRubricSchema>;
export type GenerateRubricInput = RubricPromptInput;

export async function generateRubric(
  input: GenerateRubricInput,
): Promise<SkillRubric> {
  const result = await callStructured({
    schema: SkillRubricSchema,
    jsonSchema: SkillRubricJsonSchema,
    toolName: "skill_rubric_payload",
    toolDescription:
      "A reusable 0 to 5 rubric for evaluating one skill in a candidate's written response.",
    system: RUBRIC_SYSTEM_PROMPT,
    user: buildRubricUserPrompt(input),
    maxTokens: 1200,
  });

  if (result.skill !== input.skillName) {
    return {
      ...result,
      skill: input.skillName,
    };
  }

  return result;
}
