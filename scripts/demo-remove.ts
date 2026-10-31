/**
 * Permanently removes all demo data (isDemo users, listings, Jewish places and the "Demo:" scam
 * alert) — the same as Admin → Settings → "Remove demo data". Real content (cities,
 * neighborhoods, FAQ, banned words, settings) is kept.
 *
 *   npm run demo:remove            shows what would be deleted
 *   npm run demo:remove -- --yes   deletes it
 *
 * To only hide demo data (reversible), switch off "Show demo data" in Admin → Settings instead.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { countDemoData, removeDemoData } from "@/lib/demo";
import { db } from "@/lib/db";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const confirmed = process.argv.slice(2).includes("--yes");
  const counts = await countDemoData();
  const summary = `${counts.listings} listings, ${counts.users} users, ${counts.places} Jewish places, ${counts.alerts} scam alerts`;

  if (!confirmed) {
    console.log(`Demo data found: ${summary}.`);
    console.log("Nothing was deleted. Run `npm run demo:remove -- --yes` to delete it permanently.");
    return;
  }

  const removed = await removeDemoData();
  console.log(
    `Removed ${removed.listings} listings, ${removed.users} users, ${removed.places} Jewish places and ${removed.alerts} scam alerts.`,
  );
}

main()
  .catch((error) => {
    console.error("Removing demo data failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
