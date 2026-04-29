import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration for Phase 11.
 *
 * - Tests live next to the modules they cover (src/**\/*.test.ts) plus a
 *   handful of cross-cutting tests under `src/test/`.
 * - We never reach a real Postgres or OpenAI from tests:
 *     • DB-touching tests use a process-local pglite (in-memory Postgres).
 *     • LLM-touching tests mock `@/lib/server/llm`.
 * - `setupFiles` populates the env vars required by `src/env.ts` before any
 *   module that imports it gets pulled in.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./src/test/setup-env.ts"],
    include: ["src/**/*.test.ts"],
    // Migration apply-test boots a real (in-process) Postgres; give it room.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
