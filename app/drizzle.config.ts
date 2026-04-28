import { defineConfig } from "drizzle-kit";

// We expect the env to be loaded already (via dotenv-cli for the `db:*`
// scripts, or by Next.js / the host shell otherwise).
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

export default defineConfig({
  schema: "./src/lib/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Be defensive with Supabase: warn before destructive ops.
  strict: true,
  verbose: true,
});
