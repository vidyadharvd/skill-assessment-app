import { beforeEach, describe, expect, it, vi } from "vitest";

import { type SkillRubric } from "@/lib/server/rubrics";

// We mock the LLM module before importing `evaluateSkill`, so the real
// OpenAI client never gets instantiated. `callStructured` is the only
// boundary `evaluator/` reaches across. `vi.hoisted` is required because
// `vi.mock` factories are hoisted above all `import` lines.
const { callStructuredMock } = vi.hoisted(() => ({
  callStructuredMock: vi.fn(),
}));
vi.mock("@/lib/server/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/llm")>(
    "@/lib/server/llm",
  );
  return {
    ...actual,
    callStructured: callStructuredMock,
  };
});

import { evaluateSkill, type EvaluateSkillInput } from "./evaluate";

const rubric: SkillRubric = {
  skill: "Decision-making under ambiguity",
  criteria: [
    "Names the trade-offs being made before choosing.",
    "Picks an option and articulates the reason.",
  ],
  scale: {
    "0": "No reasoning visible.",
    "1": "Lists options but no rationale.",
    "2": "Picks an option with shallow rationale.",
    "3": "Names trade-offs and picks coherently.",
    "4": "Strong reasoning with one weak link.",
    "5": "Decisive, well-justified, and self-aware.",
  },
  scoring_instructions: [
    "Reward explicit trade-off naming.",
    "Penalize fence-sitting or pure option enumeration.",
    "Anchor in the candidate's response, not your priors.",
  ],
};

const input: EvaluateSkillInput = {
  functionName: "Engineering",
  roleName: "Staff Engineer",
  subjectName: "Technical leadership",
  outcomeDescription: "Pick between rewriting and patching a flaky service.",
  questionText: "What's your call and why?",
  responseText: "Patching now, rewrite scheduled for Q3 because...",
  skillName: "Decision-making under ambiguity",
  rubric,
};

describe("evaluateSkill", () => {
  beforeEach(() => {
    callStructuredMock.mockReset();
  });

  it("forwards a well-formed structured-output request to the LLM module", async () => {
    callStructuredMock.mockResolvedValueOnce({
      score: 4,
      justification:
        "Names the patch-vs-rewrite trade-off explicitly and picks a path.",
    });

    const result = await evaluateSkill(input);

    expect(result).toEqual({
      score: 4,
      justification:
        "Names the patch-vs-rewrite trade-off explicitly and picks a path.",
    });
    expect(callStructuredMock).toHaveBeenCalledTimes(1);

    const [args] = callStructuredMock.mock.calls[0]!;
    expect(args.toolName).toBe("skill_evaluation_payload");
    expect(args.system).toMatch(/rubric/i);
    expect(args.user).toContain(input.skillName);
    expect(args.user).toContain(input.responseText);
    expect(args.jsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["score", "justification"],
    });
  });

  it("returns the parsed result when the LLM produces a boundary score", async () => {
    callStructuredMock.mockResolvedValueOnce({
      score: 0,
      justification: "Response did not engage the prompt at all.",
    });

    const result = await evaluateSkill(input);
    expect(result.score).toBe(0);
    expect(result.justification.length).toBeGreaterThan(0);
  });

  it("propagates upstream LLM errors without swallowing them", async () => {
    const boom = new Error("LLM unavailable");
    callStructuredMock.mockRejectedValueOnce(boom);

    await expect(evaluateSkill(input)).rejects.toThrow(/LLM unavailable/);
  });
});
