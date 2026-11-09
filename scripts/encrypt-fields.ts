/**
 * Field encryption (SECURITY_REPORT 12.3.c, D7 (a)): moves every plain exact address, exact pin and
 * guest phone into its encrypted column, empties the plain columns, re-seals values sealed with an
 * old key (key rotation), and — once no plain value is left — makes the database refuse new ones
 * (CHECK constraints). The procedure and the key rotation: docs/security/field-encryption.md.
 *
 *   npm run db:encrypt-fields -- --dry-run     count only, change nothing
 *   npm run db:encrypt-fields                  encrypt / re-seal, empty the plain columns, add the guard
 *   npm run db:encrypt-fields -- --batch 500   rows per batch (default 200)
 *
 * Needs the new columns first (npx prisma db execute --file prisma/sql/before-push.sql && npx prisma
 * db push) and the key the site uses (FIELD_ENCRYPTION_KEY; during a rotation also
 * FIELD_ENCRYPTION_KEY_PREVIOUS). Idempotent and batched: run it as often as you like, a second run
 * finds nothing to do. It never prints a value, only counts and the key id. Exit code 1 when
 * something is left (a value it could not open, a plain value it could not move), so a deploy
 * script notices.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { encryptPlainFields } from "@/lib/field-crypto-migrate";

function batchSize(argv: string[]): number | undefined {
  const index = argv.findIndex((arg) => arg === "--batch" || arg.startsWith("--batch="));
  if (index < 0) return undefined;
  const raw = argv[index]!.includes("=") ? argv[index]!.split("=")[1] : argv[index + 1];
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 5000) throw new Error("--batch must be a whole number from 1 to 5000");
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const report = await encryptPlainFields(db, { dryRun, batchSize: batchSize(argv) });
  const t = (name: string, r: typeof report.listings) =>
    `${name}: ${r.changed} rows ${dryRun ? "to change" : "changed"} (${r.sealed} sealed, ${r.resealed} re-sealed, ${r.cleared} plain copies emptied, ${r.unreadable} unreadable, ${r.skipped} skipped)`;
  console.log(`[encrypt-fields] key ${report.keyId}${dryRun ? " — dry run, nothing changed" : ""}`);
  console.log(`[encrypt-fields] ${t("listings", report.listings)}`);
  console.log(`[encrypt-fields] ${t("bookings", report.bookings)}`);
  console.log(
    `[encrypt-fields] left: ${report.remainingPlain.listings} listings and ${report.remainingPlain.bookings} bookings with plain values; ` +
      `${report.remainingOldKey.listings} listings and ${report.remainingOldKey.bookings} bookings under an old key`,
  );
  console.log(`[encrypt-fields] database guard: listings ${report.guard.listing ? "on" : "off"}, bookings ${report.guard.booking ? "on" : "off"}`);
  const unreadable = report.listings.unreadable + report.bookings.unreadable;
  if (unreadable > 0) {
    console.error(
      `[encrypt-fields] ${unreadable} stored values could not be opened with this server's keys: they were left as they are. ` +
        "Set the key they were sealed with as FIELD_ENCRYPTION_KEY_PREVIOUS and run again (docs/security/field-encryption.md).",
    );
  }
  const left = report.remainingPlain.listings + report.remainingPlain.bookings + report.remainingOldKey.listings + report.remainingOldKey.bookings;
  if (!dryRun && (unreadable > 0 || left > 0)) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[encrypt-fields] failed:", (error as Error)?.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
