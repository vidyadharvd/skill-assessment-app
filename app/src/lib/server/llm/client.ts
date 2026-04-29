/**
 * Provider-agnostic LLM client.
 *
 * For the MVP this is a thin wrapper around the OpenAI SDK so the rest of
 * the codebase only knows about `callStructured` — swapping providers later
 * means rewriting this file alone (per build_plan §4).
 *
 * Responsibilities:
 *   - Hold the singleton OpenAI client (so we don't open a fresh HTTP
 *     keep-alive pool on every call).
 *   - Enforce a timeout per call.
 *   - Retry on transient errors (the SDK already retries 5xx / 429; we add
 *     one extra attempt around schema-validation failures so a single bad
 *     JSON output doesn't kill the request).
 *   - Coerce structured output via OpenAI structured outputs
 *     (response_format: json_schema, strict: true) → Zod.
 *
 * Anything provider-specific (model name, message shape, response format)
 * stops here.
 */

import OpenAI from "openai";
import type { z } from "zod";

import { env } from "@/env";

import {
  LLMRequestError,
  LLMTimeoutError,
  LLMValidationError,
} from "./errors";

// Sensible default; overridable via OPENAI_MODEL env var or per-call.
// Must support structured outputs (json_schema strict mode). `gpt-4o` aliases
// to the latest 2024-08-06+ snapshot, all of which support it.
const DEFAULT_MODEL = env.OPENAI_MODEL ?? "gpt-4o";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_VALIDATION_RETRIES = 1;

declare global {
  // eslint-disable-next-line no-var
  var __openai__: OpenAI | undefined;
}

function getOpenAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new LLMRequestError(
      "OPENAI_API_KEY is not configured. Set it in .env.local before calling the LLM.",
    );
  }

  if (!globalThis.__openai__) {
    globalThis.__openai__ = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      // SDK-level retries handle 429 / 5xx with exponential backoff.
      maxRetries: 2,
    });
  }

  return globalThis.__openai__;
}

/**
 * JSON Schema fragment passed to OpenAI as the `response_format.json_schema`.
 *
 * We avoid pulling in `zod-to-json-schema` for one schema; instead callers
 * pass an explicit JSON Schema alongside the Zod schema. This keeps the
 * dependency surface tiny and the contract obvious at the call site.
 *
 * Strict-mode requirements (enforced by the API, not us):
 *   - `additionalProperties: false`
 *   - every property listed in `required`
 *   - no unsupported keywords (e.g. `minLength`/`maxLength` are accepted, but
 *     `format` and a few others are not — see the OpenAI structured-outputs
 *     docs for the current allowlist).
 */
export type JsonSchema = Record<string, unknown>;

export type CallStructuredOptions<T extends z.ZodTypeAny> = {
  /** Zod schema the parsed JSON output must satisfy. */
  schema: T;
  /** JSON Schema mirroring `schema`, sent to OpenAI as the structured-output schema. */
  jsonSchema: JsonSchema;
  /** Stable name for the schema; surfaces in observability. */
  toolName: string;
  /** Short description of what the schema represents. */
  toolDescription: string;
  /** Top-level system prompt. */
  system: string;
  /** Single user-turn prompt. */
  user: string;
  /** Override model. Defaults to gpt-4o. */
  model?: string;
  /** Override max tokens. */
  maxTokens?: number;
  /** Override timeout. */
  timeoutMs?: number;
  /** Override how many times we retry pure validation failures. */
  validationRetries?: number;
};

/**
 * Call the LLM and return a value that is guaranteed (by Zod) to match
 * `schema`. Throws an `LLMRequestError`, `LLMTimeoutError`, or
 * `LLMValidationError` on failure — never returns something the caller
 * still has to validate.
 */
export async function callStructured<T extends z.ZodTypeAny>(
  options: CallStructuredOptions<T>,
): Promise<z.infer<T>> {
  const {
    schema,
    jsonSchema,
    toolName,
    toolDescription,
    system,
    user,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    validationRetries = DEFAULT_VALIDATION_RETRIES,
  } = options;

  const client = getOpenAIClient();

  let lastValidationError: LLMValidationError | null = null;
  const maxAttempts = Math.max(1, validationRetries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await withTimeout(
        client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          // Structured outputs: the model is constrained to emit JSON that
          // satisfies `schema`. With `strict: true` the API will reject the
          // request up front if the schema itself isn't strict-compatible.
          response_format: {
            type: "json_schema",
            json_schema: {
              name: toolName,
              description: toolDescription,
              schema: jsonSchema,
              strict: true,
            },
          },
        }),
        timeoutMs,
      );
    } catch (err) {
      if (err instanceof LLMTimeoutError) {
        throw err;
      }
      // OpenAI's APIError carries .status / .error.message that's far more
      // useful than the bare Error.message. Pull what we can so the server
      // log tells us why the call failed (404 model id, 401 bad key, 429
      // rate limit, etc.) without us having to re-poke the API.
      const detail = describeSdkError(err);
      // eslint-disable-next-line no-console
      console.error("[llm] OpenAI request failed:", detail);
      throw new LLMRequestError(detail, err);
    }

    const message = response.choices[0]?.message;

    // The model can refuse the task; in that case `content` is null and
    // `refusal` carries an explanation. Treat as a validation failure so
    // the retry loop kicks in once before giving up.
    if (message?.refusal) {
      lastValidationError = new LLMValidationError(
        `LLM refused to comply: ${message.refusal}`,
        message.refusal,
        null,
      );
      continue;
    }

    const content = message?.content;
    if (!content) {
      lastValidationError = new LLMValidationError(
        "LLM response contained no content",
        response,
        null,
      );
      continue;
    }

    // Strict structured outputs guarantee parseable JSON, but we still wrap
    // the parse in a try/catch — the guarantee only kicks in on success
    // statuses, and a flaky stream can in theory truncate.
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      lastValidationError = new LLMValidationError(
        "LLM response was not valid JSON",
        content,
        null,
      );
      continue;
    }

    const parsed = schema.safeParse(parsedJson);

    if (parsed.success) {
      return parsed.data;
    }

    lastValidationError = new LLMValidationError(
      "LLM structured output failed Zod validation",
      parsedJson,
      parsed.error.flatten(),
    );
  }

  throw (
    lastValidationError ??
    new LLMValidationError("LLM call exhausted retries", null, null)
  );
}

/**
 * Best-effort string description of an OpenAI SDK error. The SDK throws
 * `OpenAI.APIError` subclasses with `status` and `error?.message` fields
 * when the API returns a non-2xx; everything else is a regular Error. We
 * avoid `instanceof APIError` to keep this file independent of SDK
 * internals — duck-typing is sufficient.
 */
function describeSdkError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      status?: number;
      message?: string;
      error?: { error?: { message?: string }; message?: string };
    };
    const status = typeof e.status === "number" ? `[${e.status}] ` : "";
    const apiMsg = e.error?.error?.message ?? e.error?.message;
    if (apiMsg) {
      return `${status}${apiMsg}`;
    }
    if (e.message) {
      return `${status}${e.message}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LLMTimeoutError(timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
