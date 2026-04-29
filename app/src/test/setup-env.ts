/**
 * Vitest setup file.
 *
 * Runs once per worker before any test imports the app. Its only job is to
 * populate the env vars `src/env.ts` insists on so that loading
 * `@/env` (transitive on most server modules) doesn't throw. We use
 * obviously-fake values — nothing here ever talks to a real Supabase or
 * OpenAI; tests that need an LLM mock `@/lib/server/llm`, tests that need a
 * DB use the in-memory pglite client wired up in `src/test/test-db.ts`.
 */

// `process.env` is typed read-only for `NODE_ENV` in @types/node, so we cast
// through `Record<string, string | undefined>` for the writes here.
const e = process.env as Record<string, string | undefined>;
e.NODE_ENV ??= "test";
e.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
e.NEXTAUTH_SECRET ??= "test-nextauth-secret";
e.GOOGLE_CLIENT_ID ??= "test-google-client-id";
e.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
e.OPENAI_API_KEY ??= "sk-test-not-a-real-key";
