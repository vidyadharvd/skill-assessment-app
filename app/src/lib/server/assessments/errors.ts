import { LLMRequestError, LLMValidationError } from "@/lib/server/llm";

export class AssessmentGenerationError extends Error {
  readonly assessmentId: number;
  readonly code:
    | "generation_request_failed"
    | "generation_invalid_output"
    | "generation_failed";
  readonly cause?: unknown;

  constructor(
    assessmentId: number,
    cause: unknown,
    code:
      | "generation_request_failed"
      | "generation_invalid_output"
      | "generation_failed",
  ) {
    super(`Assessment generation failed for assessment ${assessmentId}`);
    this.name = "AssessmentGenerationError";
    this.assessmentId = assessmentId;
    this.code = code;
    this.cause = cause;
  }
}

export function getGenerationFailureCode(
  error: unknown,
): AssessmentGenerationError["code"] {
  if (error instanceof LLMValidationError) {
    return "generation_invalid_output";
  }

  if (error instanceof LLMRequestError) {
    return "generation_request_failed";
  }

  return "generation_failed";
}
