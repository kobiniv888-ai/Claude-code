/**
 * Makes an EXISTING account the site's admin (the first admin; later ones can be given roles in
 * Admin → Roles). Logged in the audit log. Refuses demo accounts. 2-step login (Google
 * Authenticator) stays required: the next visit to /admin asks for it.
 *
 *   npm run admin:grant -- --email you@example.com
 *   npm run admin:grant -- --phone +972531234567
 *   npm run admin:grant -- --from-env     (BAYIT_ADMIN_EMAIL, else BAYIT_ADMIN_PHONE, from .env)
 *
 * The account must exist first: sign in on the site once with that email (or Google) or phone.
 * --from-env is run by the codespace start (.devcontainer/start.sh and setup.sh) and says nothing
 * while the settings are empty or the account does not exist yet. Only a masked email / phone is
 * ever printed. Rules and messages: src/lib/admin/maintenance/grant-admin.ts.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { db } from "@/lib/db";
import { grantAdmin, grantMessage, parseGrantArgs, type GrantDb } from "@/lib/admin/maintenance/grant-admin";

const USAGE = [
  "Usage:",
  "  npm run admin:grant -- --email you@example.com",
  "  npm run admin:grant -- --phone +972531234567",
  "  npm run admin:grant -- --from-env   (reads BAYIT_ADMIN_EMAIL / BAYIT_ADMIN_PHONE from .env)",
].join("\n");

async function main() {
  const args = parseGrantArgs(process.argv.slice(2), {
    BAYIT_ADMIN_EMAIL: process.env.BAYIT_ADMIN_EMAIL,
    BAYIT_ADMIN_PHONE: process.env.BAYIT_ADMIN_PHONE,
  });
  if (!args.ok) {
    if (args.error !== "help") console.error(`Error: ${args.error}\n`);
    console.log(USAGE);
    if (args.error !== "help") process.exitCode = 2;
    return;
  }
  for (const name of args.skipped) console.error(`admin:grant: ${name} is set but is not a valid ${name.endsWith("EMAIL") ? "email address" : "phone number"}; skipped.`);
  // --from-env with nothing set: nothing to do, say nothing.
  if (args.targets.length === 0) return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");

  const outcome = await grantAdmin(db as unknown as GrantDb, args.targets);
  const message = grantMessage(outcome, { quiet: args.fromEnv });
  if (message.lines.length) (message.ok ? console.log : console.error)(message.lines.join("\n"));
  if (!message.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    // Never the connection string or the address: only the error's first line.
    const text = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error("Granting admin failed:", text.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***"));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
