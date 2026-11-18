#!/usr/bin/env node
/**
 * Downloads the synagogue photos from Wikimedia Commons (1920 px thumbnails), optimizes them and
 * records them in src/config/photos-manifest.json with their credit. Run it through
 * scripts/fetch-wikimedia-photos.sh (that one also commits and pushes).
 *
 *   node scripts/photos/fetch-wikimedia.mjs [--dry-run] [--force]
 *   WIKIMEDIA_BASE_URL=http://127.0.0.1:8080 node scripts/photos/fetch-wikimedia.mjs   (testing)
 *
 * Exit code 0 = every slot has a photo (downloaded now or before), 1 = some failed.
 */
import { createHash } from "node:crypto";
import { download, fileExists, LICENSES, readManifest, savePhoto, SIZES, SLOT_MANIFEST, sleep, writeManifest } from "./lib.mjs";

const BASE = (process.env.WIKIMEDIA_BASE_URL || "https://upload.wikimedia.org").replace(/\/+$/, "");
/** Wikimedia only serves some thumbnail widths (20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840). */
const WIDTH = 1920;
const DELAY_MS = Number(process.env.WIKIMEDIA_DELAY_MS ?? 2000);
const USER_AGENT = "BayitPhotoFetcher/1.0 (Bayit website; one-time download of freely licensed synagogue photos; contact: site owner)";

const file = (name, author, licenseKey, title) => ({ name, author, license: LICENSES[licenseKey], title });

/** Slot path → Commons files to try, best first (from the photo research). */
export const WIKIMEDIA_PHOTOS = {
  "/photos/jewish/tbilisi-great-synagogue.webp": [
    file("Tbilisi_-_Great_Synagogue_of_Tbilisi_-_2025-10_-_p1.jpg", "Александр Сигачёв", "cc0", "The Great Synagogue of Tbilisi"),
    file("Great_Synagogue_(Tbilisi).jpg", "Ավետիսյան91", "cc-by-sa-4.0", "The Great Synagogue of Tbilisi"),
  ],
  "/photos/jewish/batumi-synagogue.webp": [
    file("Батумська_синагога_липень_2019.JPG", "IgorTurzh", "pd", "The Batumi synagogue"),
    file("Batumi_synagogue.jpg", "Dor Shabashewitz", "cc-by-4.0", "The Batumi synagogue"),
  ],
  "/photos/jewish/synagogue-interior.webp": [
    file("Interior_of_Tbilisi_great_synagogue_1274.jpg", "יעקב", "cc0", "Inside the Great Synagogue of Tbilisi"),
    file("Tbilisi_Synagogue_Interior.jpg", "Rymfoley", "cc-by-sa-4.0", "Inside the Great Synagogue of Tbilisi"),
  ],
};

/** upload.wikimedia.org/wikipedia/commons/thumb/a/ab/<File>/1920px-<File> (a/ab = md5 of the name). */
export function thumbUrl(name, width = WIDTH, base = BASE) {
  const hash = createHash("md5").update(name).digest("hex");
  const encoded = encodeURIComponent(name);
  return `${base}/wikipedia/commons/thumb/${hash[0]}/${hash.slice(0, 2)}/${encoded}/${width}px-${encoded}`;
}

function fetchWithRetry(url) {
  try {
    return download(url, { userAgent: USER_AGENT, timeoutSeconds: 90 });
  } catch (error) {
    if (!/(429|503)/.test(String(error.message))) throw error;
    console.log("    Wikimedia asked us to slow down — waiting 15 seconds…");
    return sleep(15_000).then(() => download(url, { userAgent: USER_AGENT, timeoutSeconds: 90 }));
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const manifest = readManifest(SLOT_MANIFEST);
  let failed = 0;
  let first = true;

  for (const [publicPath, options] of Object.entries(WIKIMEDIA_PHOTOS)) {
    if (!force && manifest[publicPath] && fileExists(publicPath)) {
      console.log(`  = ${publicPath} is already there`);
      continue;
    }
    let done = false;
    for (const option of options) {
      const url = thumbUrl(option.name);
      if (dryRun) {
        console.log(`  · would download ${url}\n      → public${publicPath} (${option.license.name}, ${option.author})`);
        done = true;
        break;
      }
      if (!first) await sleep(DELAY_MS);
      first = false;
      try {
        const original = await fetchWithRetry(url);
        manifest[publicPath] = await savePhoto(original, publicPath, SIZES.default, {
          title: option.title,
          author: option.author,
          source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(option.name)}`,
          license: option.license.name,
          licenseUrl: option.license.url,
        });
        writeManifest(SLOT_MANIFEST, manifest);
        console.log(`  ✓ ${publicPath} (${option.name}, ${option.license.name})`);
        done = true;
        break;
      } catch (error) {
        console.log(`    could not get ${option.name}: ${String(error.message).split("\n")[0]}`);
      }
    }
    if (!done) {
      failed++;
      console.log(`  ✗ ${publicPath}: no option could be downloaded (the site keeps showing “photo coming soon”)`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
