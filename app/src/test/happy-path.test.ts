/**
 * Phase 11 end-to-end happy path.
 *
 * Drives the full orchestrator — `createAssessmentFromOutcome` →
 * `submitAssessmentResponse` → `runAssessmentEvaluation` →
 * `getAssessmentResultsForUser` — against a real (in-process) Postgres
 * (pglite) with the LLM mocked at the `callStructured` boundary.
 *
 * If this passes, the moving parts the build plan promises in §4 are
 * actually wired together and the assessment lifecycle ends in COMPLETED
 * with a sane overall score.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  createTestDb,
  seedMinimalTaxonomy,
  type TestDb,
} from "@/test/test-db";

const { dbHandle, callStructuredMock } = vi.hoisted(() => ({
  dbHandle: { current: null as unknown },
  callStructuredMock: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  get db() {
    if (!dbHandle.current) {
      throw new Error("test-db not initialized");
    }
    return dbHandle.current;
  },
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

import {
  createAssessmentFromOutcome,
  getAssessmentResultsForUser,
  runAssessmentEvaluation,
  submitAssessmentResponse,
} from "@/lib/server/assessments";

const QUESTION =
  "You're prepping a 15-minute exec readout: walk a non-technical VP through " +
  "the trade-off behind cutting Feature X one week before launch and what " +
  "you're committing to next quarter to make up for it.";

const ANSWER =
  "I'd open with the customer impact, then frame the trade-off (ship a worse " +
  "experience now vs. a 1-quarter delay), explain why we chose the delay, " +
  "and close with the three guardrails I'm putting in place so we don't " +
  "land here again. I'd come prepared with a one-page brief and sequence " +
  "the conversation around their concerns: revenue, NPS, and team morale.";

const RUBRIC_PAYLOAD = (skill: string) => ({
  skill,
  criteria: [
    "Names the audience and intent before describing the message.",
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
});

const EVAL_PAYLOAD = (skill: string) => ({
  score: 4,
  justification: `Strong evidence for ${skill}: explicit framing, named stakeholder, clear reasoning.`,
});

describe("happy path: assessment create → submit → evaluate → results", () => {
  let db: TestDb;
  let userId: number;
  let outcomeId: number;

  beforeAll(async () => {
    db = await createTestDb();
    dbHandle.current = db;
    const seeded = await seedMinimalTaxonomy(db);
    userId = seeded.userId;
    outcomeId = seeded.outcomeId;

    // The mock has to behave like `callStructured` would: route based on the
    // tool/system to either the question, rubric, or evaluation payload.
    callStructuredMock.mockImplementation(
      async (args: { toolName: string; user: string }) => {
        if (args.toolName === "question_payload") {
          return { question: QUESTION };
        }
        if (args.toolName === "skill_rubric_payload") {
          // The rubric prompt embeds `Skill: ${skillName}`. We just echo it
          // back so callers can verify rubric.skill === skillName end-to-end.
          const match = args.user.match(/Skill:\s*(.+)/);
          const skillName = match?.[1]?.trim() ?? "Unknown";
          return RUBRIC_PAYLOAD(skillName);
        }
        if (args.toolName === "skill_evaluation_payload") {
          const match = args.user.match(/Skill to Evaluate:\s*(.+)/);
          const skillName = match?.[1]?.trim() ?? "Unknown";
          return EVAL_PAYLOAD(skillName);
        }
        throw new Error(`Unmocked tool: ${args.toolName}`);
      },
    );
  });

  it("walks an assessment from creation to a COMPLETED, scored result", async () => {
    // 1. Generate
    const created = await createAssessmentFromOutcome({
      userId,
      outcomeId,
    });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") throw new Error("not created");

    const assessmentId = created.assessmentId;

    // 2. Submit
    const submitted = await submitAssessmentResponse({
      assessmentId,
      userId,
      answerText: ANSWER,
    });
    expect(submitted.kind).toBe("submitted");
    if (submitted.kind !== "submitted") throw new Error("not submitted");

    // 3. Evaluate
    const evaluation = await runAssessmentEvaluation({
      assessmentId,
      responseId: submitted.responseId,
    });
    expect(evaluation.status).toBe("COMPLETED");
    expect(evaluation.evaluatedSkillCount).toBe(2);

    // 4. Results
    const results = await getAssessmentResultsForUser(assessmentId, userId);
    expect(results).not.toBeNull();
    expect(results!.status).toBe("COMPLETED");
    expect(results!.overallScore).toBe(4);
    expect(results!.responseText).toBe(ANSWER);
    expect(results!.questionText).toBe(QUESTION);

    expect(results!.skillScores).toHaveLength(2);
    for (const skill of results!.skillScores) {
      expect(skill.status).toBe("SCORED");
      expect(skill.score).toBe(4);
      expect(skill.justificationText).toMatch(new RegExp(skill.name));
    }

    // Sanity: the LLM was called for question (1) + rubric per skill (2) +
    // evaluation per skill (2) = 5.
    expect(callStructuredMock).toHaveBeenCalledTimes(5);
    const toolNames = callStructuredMock.mock.calls.map(
      (call) => (call[0] as { toolName: string }).toolName,
    );
    expect(toolNames.filter((n) => n === "question_payload")).toHaveLength(1);
    expect(toolNames.filter((n) => n === "skill_rubric_payload")).toHaveLength(
      2,
    );
    expect(
      toolNames.filter((n) => n === "skill_evaluation_payload"),
    ).toHaveLength(2);
  });
});
