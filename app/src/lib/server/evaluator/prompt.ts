import type { SkillRubric } from "@/lib/server/rubrics";

export type EvaluationPromptInput = {
  functionName: string;
  roleName: string;
  subjectName: string;
  outcomeDescription: string;
  questionText: string;
  responseText: string;
  skillName: string;
  rubric: SkillRubric;
};

export const EVALUATION_SYSTEM_PROMPT = [
  "You are an objective evaluator for a workplace skill-assessment platform.",
  "You score one skill at a time using the provided rubric only.",
  "Constraints:",
  "",
  "  - Evaluate only the named skill, not overall response quality.",
  "  - Follow the rubric strictly.",
  "  - Return an integer score from 0 to 5.",
  "  - Justification must be brief, evidence-based, and grounded in the",
  "    candidate's written response.",
  "  - Do not invent evidence that is not present in the response.",
  "  - Output JSON only, matching the required schema.",
].join("\n");

export function buildEvaluationUserPrompt(
  input: EvaluationPromptInput,
): string {
  return [
    "Context:",
    `Function: ${input.functionName}`,
    `Role: ${input.roleName}`,
    `Subject: ${input.subjectName}`,
    `Outcome: ${input.outcomeDescription}`,
    "",
    "Question:",
    input.questionText,
    "",
    "User Response:",
    input.responseText,
    "",
    `Skill to Evaluate: ${input.skillName}`,
    "",
    "Rubric:",
    JSON.stringify(input.rubric, null, 2),
    "",
    "Instructions:",
    "- Evaluate only this skill.",
    "- Follow the rubric strictly.",
    "- Return one integer score (0-5) and a concise justification.",
  ].join("\n");
}
