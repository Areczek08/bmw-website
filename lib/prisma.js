import { PrismaClient } from "@prisma/client";

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URI;

const globalForPrisma = global;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log: ['error'],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
