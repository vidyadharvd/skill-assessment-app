/**
 * LLM error taxonomy.
 *
 * Callers should distinguish "the model misbehaved" (LLMValidationError)
 * from "the call itself failed" (LLMRequestError) so they can pick the
 * right user-facing copy and retry strategy.
 */

export class LLMRequestError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LLMRequestError";
    this.cause = cause;
  }
}

export class LLMTimeoutError extends LLMRequestError {
  constructor(timeoutMs: number, cause?: unknown) {
    super(`LLM call timed out after ${timeoutMs}ms`, cause);
    this.name = "LLMTimeoutError";
  }
}

export class LLMValidationError extends Error {
  readonly raw: unknown;
  readonly issues: unknown;

  constructor(message: string, raw: unknown, issues: unknown) {
    super(message);
    this.name = "LLMValidationError";
    this.raw = raw;
    this.issues = issues;
  }
}
