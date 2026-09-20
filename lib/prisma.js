import { PrismaClient } from "@prisma/client/wasm";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const defaultDbUrl = "mysql://www13461_bojarsystemweb:lgeKyRxxxMF6XWKv8ALd@54.38.50.59:3306/www13461_bojarsystemweb";

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URI || defaultDbUrl;

const globalForPrisma = globalThis;

function createPrismaClient() {
  // Cloudflare Workers: use minimal pool to avoid timeout errors
  // Workers don't maintain persistent connections between requests,
  // so a large pool causes "pool timeout" errors
  const adapter = new PrismaMariaDb(dbUrl, {
    connectionLimit: 1,
    connectTimeout: 5000,
    idleTimeout: 0,
    acquireTimeout: 8000,
  });
  return new PrismaClient({
    adapter,
    log: ['error'],
  });
}

export const prisma =
  globalForPrisma.prisma ||
  (globalForPrisma.prisma = createPrismaClient());
