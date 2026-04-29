/**
 * Prompt templates for question generation.
 *
 * The shape lives here so prompt-tuning is one file change. Anything that
 * touches provider-specific API calls is in `/lib/server/llm`.
 *
 * Spec: docs/assessment_generation_scoring_logic.md §1
 *   - One comprehensive scenario-based question
 *   - Implicitly covers ALL mapped skills
 *   - Skill names must NOT appear verbatim
 */

export type QuestionPromptInput = {
  functionName: string;
  roleName: string;
  subjectName: string;
  outcomeDescription: string;
  skillNames: string[];
};

export const QUESTION_SYSTEM_PROMPT = [
  "You are an assessment question writer for a workplace skill-assessment platform.",
  "Your job is to write a single scenario-based, free-response question that",
  "implicitly tests every skill the assessor cares about. Constraints:",
  "",
  "  - Output exactly one question, not multiple.",
  "  - The question must be a realistic workplace scenario for the given role,",
  "    not a textbook prompt.",
  "  - Cover every skill the user lists, but never name a skill verbatim and",
  "    never tell the candidate which skills they will be evaluated on.",
  "  - Demand a written response that requires reasoning, not a checklist.",
  "  - Aim for 80–220 words. Long enough to give context, short enough to read",
  "    in under a minute.",
  "  - Use plain prose. No bullet lists, no markdown headings, no preamble like",
  "    'Here is a question:'. Just the scenario and the ask.",
].join("\n");

export function buildQuestionUserPrompt(input: QuestionPromptInput): string {
  const skillsBlock = input.skillNames.map((s) => `  - ${s}`).join("\n");

  return [
    "Context:",
    `Function: ${input.functionName}`,
    `Role: ${input.roleName}`,
    `Subject: ${input.subjectName}`,
    `Outcome: ${input.outcomeDescription}`,
    "",
    "Skills the question must implicitly cover (do NOT name them in the question):",
    skillsBlock,
    "",
    "Write the question now and return it as JSON matching the required schema.",
  ].join("\n");
}
