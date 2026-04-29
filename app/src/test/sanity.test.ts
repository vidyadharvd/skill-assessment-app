import { describe, expect, it } from "vitest";

describe("vitest boot", () => {
  it("loads env vars from setup file", () => {
    expect(process.env.NEXTAUTH_SECRET).toBeTruthy();
    expect(process.env.OPENAI_API_KEY).toBeTruthy();
  });

  it("imports the env module without throwing", async () => {
    const { env } = await import("@/env");
    expect(env.NODE_ENV).toBe("test");
    expect(env.OPENAI_API_KEY).toBeDefined();
  });
});
