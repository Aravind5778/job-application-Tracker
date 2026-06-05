/**
 * Prisma CLI configuration (Prisma 7+).
 *
 * In Prisma 7 the datasource URL and the seed command moved out of
 * schema.prisma / package.json into this file. PrismaClient itself reads the
 * URL through the better-sqlite3 driver adapter — see src/lib/db.ts.
 */
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
