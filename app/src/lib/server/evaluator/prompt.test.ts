import { describe, expect, it } from "vitest";

import { type SkillRubric } from "@/lib/server/rubrics";

import {
  buildEvaluationUserPrompt,
  EVALUATION_SYSTEM_PROMPT,
  type EvaluationPromptInput,
} from "./prompt";

const sampleRubric: SkillRubric = {
  skill: "Stakeholder communication",
  criteria: [
    "States audience and intent before describing the message.",
    "Adapts tone and detail to the named stakeholder.",
  ],
  scale: {
    "0": "No relevant evidence in the response.",
    "1": "Mentions audience but does not adapt the message.",
    "2": "Adapts at most one element to the audience.",
    "3": "Adapts tone and content with minor gaps.",
    "4": "Clear, well-targeted message with small slips.",
    "5": "Crisp, audience-perfect, with explicit reasoning.",
  },
  scoring_instructions: [
    "Anchor every claim in evidence from the candidate's response.",
    "Penalize generic advice that ignores the named stakeholder.",
    "Reward explicit framing of audience, intent, and structure.",
  ],
};

const sampleInput: EvaluationPromptInput = {
  functionName: "Product",
  roleName: "Product Manager",
  subjectName: "Stakeholder communication",
  outcomeDescription:
    "Communicate a launch decision to a non-technical exec sponsor.",
  questionText: "Walk a VP through why we cut a feature one week before launch.",
  responseText:
    "I would open with the impact, then the trade-off we faced, then the path back...",
  skillName: "Stakeholder communication",
  rubric: sampleRubric,
};

describe("EVALUATION_SYSTEM_PROMPT", () => {
  it("locks the evaluator into rubric-grounded scoring", () => {
    expect(EVALUATION_SYSTEM_PROMPT).toMatch(/objective evaluator/i);
    expect(EVALUATION_SYSTEM_PROMPT).toMatch(/rubric/i);
    expect(EVALUATION_SYSTEM_PROMPT).toMatch(/0 to 5/);
    expect(EVALUATION_SYSTEM_PROMPT).toMatch(/JSON only/i);
  });
});

describe("buildEvaluationUserPrompt", () => {
  it("includes every taxonomy field, the question, the response, the skill name and the serialized rubric", () => {
    const prompt = buildEvaluationUserPrompt(sampleInput);

    expect(prompt).toContain("Function: Product");
    expect(prompt).toContain("Role: Product Manager");
    expect(prompt).toContain("Subject: Stakeholder communication");
    expect(prompt).toContain(`Outcome: ${sampleInput.outcomeDescription}`);
    expect(prompt).toContain(sampleInput.questionText);
    expect(prompt).toContain(sampleInput.responseText);
    expect(prompt).toContain(`Skill to Evaluate: ${sampleInput.skillName}`);

    // The rubric must be embedded as JSON, not just paraphrased.
    const rubricJson = JSON.stringify(sampleRubric, null, 2);
    expect(prompt).toContain(rubricJson);
  });

  it("evaluates only the named skill (no cross-skill leakage)", () => {
    const prompt = buildEvaluationUserPrompt(sampleInput);

    expect(prompt).toMatch(/Evaluate only this skill/i);
    expect(prompt).toMatch(/integer score \(0-5\)/);
  });
});
