import { PrismaClient } from "@prisma/client/wasm";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const defaultDbUrl = "mysql://www13461_bojarsystemweb:lgeKyRxxxMF6XWKv8ALd@54.38.50.59:3306/www13461_bojarsystemweb";
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URI || defaultDbUrl;

const globalForPrisma = global;

function createPrismaClient() {
  const adapter = new PrismaMariaDb(dbUrl);
  return new PrismaClient({
    adapter,
    log: ['error'],
  });
}

export const prisma =
  globalForPrisma.prisma ||
  createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
