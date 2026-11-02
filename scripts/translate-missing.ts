/**
 * Translates every real listing that is missing a language (Google Cloud Translation, needs
 * GOOGLE_TRANSLATE_API_KEY). For listings sent before translation was switched on; new and
 * edited listings are translated automatically. Safe to run again: complete listings are skipped.
 *
 *   npm run translate:missing
 *
 * .devcontainer/start.sh runs it on every start when the key is set.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { db } from "@/lib/db";
import { isTranslationEnabled, translateMissingListings } from "@/lib/translate";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  if (!isTranslationEnabled()) {
    console.log("Translation is off (GOOGLE_TRANSLATE_API_KEY is not set) — nothing to do.");
    return;
  }
  const { checked, translated } = await translateMissingListings();
  console.log(`Translations: checked ${checked} listings, translated ${translated}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
