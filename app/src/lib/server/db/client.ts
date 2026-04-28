/**
 * Drizzle DB client — single shared instance for the app.
 *
 * In Next.js dev, hot reload can produce many module instances; we cache the
 * underlying postgres-js connection on `globalThis` to avoid leaking sockets.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pg__: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__pg__ ??
  postgres(env.DATABASE_URL, {
    max: 10,
    // Supabase requires SSL; postgres-js auto-detects from the URL,
    // but be explicit in production.
    ssl: env.NODE_ENV === "production" ? "require" : "prefer",
    prepare: false, // safer with PgBouncer (Supabase pooler) in transaction mode
  });

if (env.NODE_ENV !== "production") {
  globalThis.__pg__ = client;
}

export const db = drizzle(client, { schema });
export type DB = typeof db;
