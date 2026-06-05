/**
 * Seed script — idempotent.
 *
 * - Ensures the singleton Profile row exists (empty by default).
 * - Inserts the four default pipeline columns iff there are zero columns yet.
 *   Users can rename, reorder, or delete them later from the Settings page.
 *
 * Invoked by:
 *   - `npx prisma db seed` (configured via package.json#prisma.seed)
 *   - `npm run db:seed`
 *   - automatically after `npm run db:reset`
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./data/app.db",
});
const prisma = new PrismaClient({ adapter });

const DEFAULT_COLUMNS = [
  { name: "Wishlist", order: 10 },
  { name: "Applied", order: 20 },
  { name: "Interviewing", order: 30 },
  { name: "Rejected", order: 40 },
];

async function main() {
  // Singleton profile row — created empty; user fills it in on /profile.
  await prisma.profile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  // Seed default columns only when there are none. Idempotent + non-destructive.
  const existing = await prisma.column.count();
  if (existing === 0) {
    await prisma.column.createMany({ data: DEFAULT_COLUMNS });
    console.log(`Seeded ${DEFAULT_COLUMNS.length} default columns.`);
  } else {
    console.log(`Skipping column seed (${existing} columns already exist).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
