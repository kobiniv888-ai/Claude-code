/**
 * Bayit seed — `npm run db:seed` (tsx --require ./scripts/server-script.cjs prisma/seed/index.ts).
 *
 * Idempotent: every row has a stable id or unique key and is upserted, and child rows (photos,
 * room types, stats, ticket messages…) are rebuilt, so running it again never duplicates
 * anything. See docs/DEMO-DATA.md for what is seeded and how to remove the demo part.
 *
 * Real content (kept before launch): cities + photos, neighborhoods, FAQ, banned words, saved
 * replies, the "Show demo data" setting.
 * Demo content (isDemo / "Demo:"): users, Jewish places, listings, activity, one scam alert.
 */
import "./esm-interop";
// Before .env is loaded: SITE_ENV / SEED_DEMO as the command line gave them (seed-demo-into-prod).
import { SEED_DEMO_BEFORE_DOTENV, SITE_ENV_BEFORE_DOTENV } from "./site-env-before-dotenv";
import "dotenv/config";
import { db } from "@/lib/db";
import { clearPlacesCache } from "@/lib/places";
import { clearSettingsCache } from "@/lib/settings";
import { readSiteEnv } from "@/lib/site-env";
import { readSiteMarker, siteMarkerDecision } from "@/lib/site-env-marker";
import { seedActivity } from "./activity";
import { seedBookings } from "./bookings";
import { seedDemoDecision } from "./demo-decision";
import { seedBannedWords, seedDemoScamAlert, seedSavedReplies, seedSettings } from "./content";
import { seedFaq } from "./faq";
import { seedJewishPlaces } from "./jewish-places";
import { seedListings } from "./listings";
import { seedPlaces } from "./places";
import { seedUsers } from "./users";

async function step<T>(label: string, run: () => Promise<T>, describe: (result: T) => string = defaultDetail): Promise<T> {
  const started = Date.now();
  const result = await run();
  console.log(`  ✓ ${label}${describe(result)} — ${Date.now() - started} ms`);
  return result;
}

function defaultDetail(result: unknown): string {
  if (typeof result === "number") return ` (${result})`;
  if (result && typeof result === "object") return ` ${JSON.stringify(result)}`;
  return "";
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  // Never into the real site's database from anything but the real site (SECURITY_REPORT 12.1.b:
  // the marker the real site writes at start; src/lib/site-env-marker.ts).
  const site = readSiteEnv();
  if (site && site !== "production") {
    const decision = siteMarkerDecision(site, await readSiteMarker(db), { failClosed: true });
    if (decision.action === "refuse") throw new Error(decision.problem);
  }
  const now = new Date();
  console.log("Seeding Bayit…");

  const places = await step(
    "cities and neighborhoods",
    () => seedPlaces(db),
    (ids) => ` (${ids.cities.size} cities, ${ids.neighborhoods.size} neighborhoods)`,
  );
  await step("settings", () => seedSettings(db));
  await step("banned words", () => seedBannedWords(db));
  await step("FAQ", () => seedFaq(db));
  await step("saved replies", () => seedSavedReplies(db));
  // Demo accounts, places, listings and bookings never go into the real site's database (founder's
  // decision 1): only when SITE_ENV=development/staging is set on the command line, or comes from
  // .env with a database on this machine, or SEED_DEMO=yes is given (./demo-decision.ts).
  const decision = seedDemoDecision({
    siteEnvBeforeDotenv: SITE_ENV_BEFORE_DOTENV,
    siteEnv: process.env.SITE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    seedDemo: SEED_DEMO_BEFORE_DOTENV,
  });
  const withDemo = decision.demo;
  if (withDemo) {
    await step("demo scam alert", () => seedDemoScamAlert(db));
    await step("demo users", () => seedUsers(db, now));
    await step("demo Jewish places", () => seedJewishPlaces(db, places.cities));
    await step("demo listings", () => seedListings(db, places, now));
    await step("demo activity", () => seedActivity(db, now));
    await step("demo bookings", () => seedBookings(db, now));
  } else {
    console.log(
      `  – demo data skipped (${decision.reason}): it is seeded only with SITE_ENV=development or staging on the command line, ` +
        "or from .env with a local database, or with SEED_DEMO=yes.",
    );
  }

  clearPlacesCache();
  clearSettingsCache();
  console.log(withDemo ? "Done. Demo logins: see docs/DEMO-DATA.md" : "Done (no demo data).");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    // A background exchange-rate refresh (no fresh rates stored) must not keep the process alive.
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
