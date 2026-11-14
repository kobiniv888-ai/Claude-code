#!/usr/bin/env node
/**
 * Downloads and optimizes the stock photos of the site's photo slots and records them in
 * src/config/photos-manifest.json (size, blur placeholder, credit). Also registers the city
 * photos in public/photos/cities. Safe to re-run: existing files are kept unless --force.
 *
 *   node scripts/photos/fetch-stock-photos.mjs [--force] [--only=/photos/hero/batumi.webp]
 */
import { CITY_PHOTOS, STOCK_PHOTOS } from "./stock-sources.mjs";
import { describePhoto, download, fileExists, readManifest, savePhoto, SIZES, SLOT_MANIFEST, sleep, writeManifest } from "./lib.mjs";

const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const manifest = readManifest(SLOT_MANIFEST);
let failed = 0;

for (const [publicPath, source] of Object.entries(STOCK_PHOTOS)) {
  if (only && publicPath !== only) continue;
  if (!force && fileExists(publicPath) && manifest[publicPath]) {
    console.log(`  = ${publicPath} (already there)`);
    continue;
  }
  try {
    const original = download(source.url);
    manifest[publicPath] = await savePhoto(original, publicPath, SIZES[source.size ?? "default"], source.credit);
    console.log(`  ✓ ${publicPath} ${manifest[publicPath].width}×${manifest[publicPath].height} ${Math.round(manifest[publicPath].bytes / 1024)} KB`);
    await sleep(300);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${publicPath}: ${error.message.split("\n")[0]}`);
  }
}

for (const [publicPath, credit] of Object.entries(CITY_PHOTOS)) {
  if (only && publicPath !== only) continue;
  if (!fileExists(publicPath)) {
    console.error(`  ✗ ${publicPath} is missing`);
    failed++;
    continue;
  }
  manifest[publicPath] = await describePhoto(publicPath, credit);
}

writeManifest(SLOT_MANIFEST, manifest);
console.log(failed ? `Done with ${failed} problem(s).` : "Done.");
process.exitCode = failed ? 1 : 0;
