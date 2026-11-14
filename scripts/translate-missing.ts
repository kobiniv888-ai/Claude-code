/**
 * Translates every real listing that is missing a language (Google Cloud Translation, needs
 * GOOGLE_TRANSLATE_API_KEY). For listings sent before translation was switched on; new and
 * edited listings are translated automatically. Then reviews and host replies without a
 * translation (src/lib/reviews/translate.ts). Safe to run again: complete ones are skipped.
 *
 *   npm run translate:missing
 *
 * .devcontainer/start.sh runs it on every start when the key is set.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { db } from "@/lib/db";
import { translateMissingReviews } from "@/lib/reviews/translate";
import { isTranslationEnabled, translateMissingListings } from "@/lib/translate";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  if (!isTranslationEnabled()) {
    console.log("Translation is off (GOOGLE_TRANSLATE_API_KEY is not set) — nothing to do.");
    return;
  }
  const { checked, translated } = await translateMissingListings();
  console.log(`Translations: checked ${checked} listings, translated ${translated}.`);
  // Reviews and host replies posted while there was no key, or whose translation failed (round 3).
  const reviews = await translateMissingReviews({ limit: 1000 });
  console.log(`Translations: ${reviews.reviews} reviews and ${reviews.replies} host replies translated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
