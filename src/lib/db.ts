/**
 * Prisma client singleton.
 *
 * In Prisma 7 the client is instantiated with a driver adapter (no more
 * `url` in schema.prisma). We cache the instance on `globalThis` so Next.js
 * dev hot-reload doesn't spawn a new connection on every module evaluation.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  var __prisma: PrismaClient | undefined;
}

function makeClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./data/app.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = global.__prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
