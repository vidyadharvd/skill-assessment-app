import { eq } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";

type UpsertUserInput = {
  avatarUrl?: string | null;
  email: string;
  name?: string | null;
  oauthProvider: string;
  providerUserId: string;
};

export async function upsertUser(input: UpsertUserInput) {
  const [existingByProvider] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.providerUserId, input.providerUserId))
    .limit(1);

  if (existingByProvider) {
    const [updated] = await db
      .update(users)
      .set({
        avatarUrl: input.avatarUrl ?? null,
        email: input.email,
        lastLoginAt: new Date(),
        name: input.name ?? null,
        oauthProvider: input.oauthProvider,
      })
      .where(eq(users.id, existingByProvider.id))
      .returning({
        email: users.email,
        id: users.id,
        name: users.name,
      });

    return updated;
  }

  const [existingByEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingByEmail) {
    const [updated] = await db
      .update(users)
      .set({
        avatarUrl: input.avatarUrl ?? null,
        email: input.email,
        lastLoginAt: new Date(),
        name: input.name ?? null,
        oauthProvider: input.oauthProvider,
        providerUserId: input.providerUserId,
      })
      .where(eq(users.id, existingByEmail.id))
      .returning({
        email: users.email,
        id: users.id,
        name: users.name,
      });

    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      avatarUrl: input.avatarUrl ?? null,
      email: input.email,
      lastLoginAt: new Date(),
      name: input.name ?? null,
      oauthProvider: input.oauthProvider,
      providerUserId: input.providerUserId,
    })
    .returning({
      email: users.email,
      id: users.id,
      name: users.name,
    });

  return created;
}
