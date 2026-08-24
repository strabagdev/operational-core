import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { getAuthCookieOptions } from "@/lib/auth-cookies";
import { applyAuthenticatedUserToToken } from "@/lib/auth-token";
import { prisma } from "@/lib/prisma";
import { withPrismaReadRetry } from "@/lib/prisma-resilience";
import { authorizeWebCredentials } from "@/lib/web-auth";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required. Define it in .env.`);
  }

  return value;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: requiredEnv("AUTH_SECRET"),
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  cookies: getAuthCookieOptions(),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        return authorizeWebCredentials(credentials);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      return applyAuthenticatedUserToToken(token, user);
    },
    async session({ session, token }) {
      const userId = typeof token.id === "string" ? token.id : undefined;

      if (!session.user || !userId) {
        return { ...session, user: undefined };
      }

      const user = await withPrismaReadRetry(
        () => prisma.user.findUnique({
          select: { active: true, platformRole: true },
          where: { id: userId },
        }),
        { context: "web.auth.session.user" },
      );

      if (!user?.active) {
        return { ...session, user: undefined };
      }

      session.user.id = userId;
      session.user.platformRole = user.platformRole;

      return session;
    },
  },
});
