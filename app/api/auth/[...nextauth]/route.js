if (typeof process !== "undefined") {
  try {
    if (!process.version || process.version === "") {
      Object.defineProperty(process, 'version', { value: 'v20.18.0', configurable: true });
    }
    if (process.versions && !process.versions.node) {
      Object.defineProperty(process.versions, 'node', { value: '20.18.0', configurable: true });
    }
  } catch (e) {}
}

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "kierowca@firma.pl" },
        password: { label: "Hasło", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const cleanEmail = credentials.email.trim().toLowerCase();

        try {
          const user = await prisma.user.findFirst({
            where: {
              email: { equals: cleanEmail }
            }
          });

          if (!user || !user.password) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            // NEVER store base64 image in JWT - it can be 600KB+ and overflow cookie/header limits
            image: (user.image && user.image.length < 500) ? user.image : null,
            firstName: user.firstName,
            discordNick: user.discordNick,
            role: user.role,
            driverStatus: user.driverStatus,
            companyId: user.companyId,
          };
        } catch (err) {
          console.error("Authorize error:", err);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.driverStatus = user.driverStatus;
        token.companyId = user.companyId;
        token.firstName = user.firstName;
        token.discordNick = user.discordNick;
        // Only store small image URLs in JWT, never large base64 strings
        token.image = (user.image && user.image.length < 500) ? user.image : null;
      }
      if (trigger === "update" && token?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { driverStatus: true, role: true, companyId: true, firstName: true, discordNick: true, name: true, image: true }
        });
        if (dbUser) {
          token.driverStatus = dbUser.driverStatus;
          token.role = dbUser.role;
          token.companyId = dbUser.companyId;
          token.firstName = dbUser.firstName;
          token.discordNick = dbUser.discordNick;
          token.name = dbUser.name;
          // Only store small image URLs in JWT, never large base64 strings
          token.image = (dbUser.image && dbUser.image.length < 500) ? dbUser.image : null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.id;
        session.user.driverStatus = token.driverStatus;
        session.user.companyId = token.companyId;
        session.user.firstName = token.firstName;
        session.user.discordNick = token.discordNick;
        session.user.image = token.image;
        if (token.name) session.user.name = token.name;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET || "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
