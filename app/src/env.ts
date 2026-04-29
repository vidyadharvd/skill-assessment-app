/**
 * Server-side environment variable validation.
 *
 * Import `env` from this module wherever you need a typed, validated env var.
 * Touching `process.env` directly elsewhere defeats the purpose.
 *
 * Per build_plan §3, env vars cover:
 *   - Postgres (Supabase): DATABASE_URL
 *   - Auth.js + Google: NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   - LLM (Phase 5+): OPENAI_API_KEY
 *
 * NODE_ENV is always present in Next.js; it's included for completeness.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database (Supabase Postgres connection string — pooler or direct)
  DATABASE_URL: z.string().url(),

  // Auth.js
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // LLM (required starting in Phase 5)
  OPENAI_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  // Override the OpenAI model id (optional). Defaults to the current
  // gpt-4o snapshot in src/lib/server/llm/client.ts.
  OPENAI_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment variables. See .env.example.");
}

export const env = parsed.data;
export type Env = typeof env;
