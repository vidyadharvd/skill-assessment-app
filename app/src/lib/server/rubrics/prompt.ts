/**
 * Prompt templates for rubric generation.
 *
 * Spec: docs/assessment_generation_scoring_logic.md §7
 *   - 0–5 scale
 *   - max 3 observable criteria
 *   - one rubric per skill
 */

export type RubricPromptInput = {
  functionName: string;
  roleName: string;
  subjectName: string;
  outcomeDescription: string;
  skillName: string;
};

export const RUBRIC_SYSTEM_PROMPT = [
  "You generate scoring rubrics for a workplace skill-assessment platform.",
  "Your job is to create a compact, objective rubric for exactly one skill.",
  "Constraints:",
  "",
  "  - Focus only on evidence observable in a written response.",
  "  - Return 1 to 3 criteria maximum.",
  "  - Each criterion should describe what strong performance looks like,",
  "    not generic personality traits or vague qualities.",
  "  - Use the same 0 to 5 scale for every skill, with clear anchors from",
  "    no evidence to excellent evidence.",
  "  - Keep the rubric concise and reusable across realistic scenarios for",
  "    the given function, role, subject, and outcome.",
  "  - Output JSON only, matching the required schema.",
].join("\n");

export function buildRubricUserPrompt(input: RubricPromptInput): string {
  return [
    "Context:",
    `Function: ${input.functionName}`,
    `Role: ${input.roleName}`,
    `Subject: ${input.subjectName}`,
    `Outcome: ${input.outcomeDescription}`,
    `Skill: ${input.skillName}`,
    "",
    "Create a rubric for evaluating only this skill in a candidate's free-form response.",
    "Return the rubric as JSON matching the required schema.",
  ].join("\n");
}
