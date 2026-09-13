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
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import mariadb from "mariadb";

function getDbConfig() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URI || "mysql://www13461_bojarsystemweb:lgeKyRxxxMF6XWKv8ALd@54.38.50.59:3306/www13461_bojarsystemweb";
  const parsed = new URL(url.replace(/^mysql:\/\//, "http://").replace(/^mariadb:\/\//, "http://"));
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "3306", 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    connectTimeout: 5000,
    socketTimeout: 5000,
  };
}

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

        let conn;
        try {
          conn = await mariadb.createConnection(getDbConfig());
          const rows = await conn.query(
            "SELECT id, email, name, image, password, firstName, discordNick, role, driverStatus, companyId FROM User WHERE email = ? LIMIT 1",
            [cleanEmail]
          );

          const user = rows && rows[0];
          if (!user || !user.password) {
            return null;
          }

          const isPasswordValid = bcrypt.compareSync(
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
          console.error("[Auth] Authorize error:", err);
          return null;
        } finally {
          if (conn) {
            try { await conn.end(); } catch (e) {}
          }
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
    async encode({ secret, token, maxAge }) {
      const secretStr = typeof secret === "string" && secret ? secret : (process.env.NEXTAUTH_SECRET || "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem");
      const secretKey = new TextEncoder().encode(secretStr);
      return new SignJWT(token)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + (maxAge || 30 * 24 * 60 * 60))
        .sign(secretKey);
    },
    async decode({ secret, token }) {
      if (!token) return null;
      try {
        const secretStr = typeof secret === "string" && secret ? secret : (process.env.NEXTAUTH_SECRET || "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem");
        const secretKey = new TextEncoder().encode(secretStr);
        const { payload } = await jwtVerify(token, secretKey);
        return payload;
      } catch (err) {
        return null;
      }
    }
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
        let conn;
        try {
          conn = await mariadb.createConnection(getDbConfig());
          const rows = await conn.query(
            "SELECT driverStatus, role, companyId, firstName, discordNick, name, image FROM User WHERE id = ? LIMIT 1",
            [token.id]
          );
          const dbUser = rows && rows[0];
          if (dbUser) {
            token.driverStatus = dbUser.driverStatus;
            token.role = dbUser.role;
            token.companyId = dbUser.companyId;
            token.firstName = dbUser.firstName;
            token.discordNick = dbUser.discordNick;
            token.name = dbUser.name;
            token.image = (dbUser.image && dbUser.image.length < 500) ? dbUser.image : null;
          }
        } catch (e) {
          console.error("JWT update error:", e);
        } finally {
          if (conn) {
            try { await conn.end(); } catch (err) {}
          }
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


