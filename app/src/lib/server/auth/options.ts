import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { env } from "@/env";
import { upsertUser } from "@/lib/server/auth/upsert-user";

export const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") {
        return false;
      }

      const email = user.email ?? profile?.email;
      const providerUserId = account.providerAccountId;

      if (!email || !providerUserId) {
        return false;
      }

      const dbUser = await upsertUser({
        avatarUrl: user.image ?? null,
        email,
        name: user.name ?? null,
        oauthProvider: account.provider,
        providerUserId,
      });

      user.id = String(dbUser.id);

      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (user?.id) {
        token.userId = user.id;
      }

      if (user?.email) {
        token.email = user.email;
      }

      if (user?.name) {
        token.name = user.name;
      }

      if (user?.image) {
        token.picture = user.image;
      }

      if (account?.provider) {
        token.oauthProvider = account.provider;
      }

      if (account?.providerAccountId) {
        token.providerUserId = account.providerAccountId;
      }

      if (profile?.email) {
        token.email = profile.email;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = String(token.userId);
      }

      if (session.user && token.oauthProvider) {
        session.user.oauthProvider = String(token.oauthProvider);
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
