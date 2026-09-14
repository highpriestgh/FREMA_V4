import { PrismaClient } from "@/generated/prisma/client";

/**
 * Singleton Prisma client.
 *
 * Prisma 7's generated client does not read DATABASE_URL ambiently — it must be
 * given either a driver adapter or an `accelerateUrl`. Our DATABASE_URL is the
 * `prisma+postgres://` proxy form (spoken by both the local `prisma dev` server
 * and Prisma Postgres in the cloud), so we pass it as `accelerateUrl`.
 *
 * The instance is cached on `globalThis` so Next.js hot-reload in development does
 * not create a new client (and connection pool) on every module reload.
 */
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to your .env file.");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    accelerateUrl: DATABASE_URL,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
