#!/usr/bin/env node
/**
 * Replaces a site photo with your own file (resized, converted to WebP, metadata stripped) and
 * records its size, blur placeholder and credit, then rewrites CREDITS.md and PHOTOS_NEEDED.md.
 *
 *   node scripts/photos/import-photo.mjs ~/my-photo.jpg /photos/hero/tbilisi.webp "Author name" "License" [source-url]
 *
 * License examples: "Own photo (all rights reserved)", "CC BY-SA 4.0", "Unsplash License".
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { LISTING_MANIFEST, readManifest, savePhoto, SIZES, SLOT_MANIFEST, writeManifest } from "./lib.mjs";

const [input, publicPath, author, license, source = ""] = process.argv.slice(2);
if (!input || !publicPath || !author || !license || !publicPath.startsWith("/photos/") || !publicPath.endsWith(".webp")) {
  console.error('Usage: node scripts/photos/import-photo.mjs <file> </photos/…/name.webp> "<author>" "<license>" [source-url]');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`File not found: ${input}`);
  process.exit(1);
}

const manifestFile = publicPath.startsWith("/photos/listings/") ? LISTING_MANIFEST : SLOT_MANIFEST;
const manifest = readManifest(manifestFile);
const size = publicPath.startsWith("/photos/hero/") ? SIZES.hero : SIZES.default;
const licenseUrl = /^CC BY-SA 4\.0/.test(license)
  ? "https://creativecommons.org/licenses/by-sa/4.0/"
  : /^CC BY 4\.0/.test(license)
    ? "https://creativecommons.org/licenses/by/4.0/"
    : source;
manifest[publicPath] = await savePhoto(fs.readFileSync(input), publicPath, size, {
  title: manifest[publicPath]?.credit?.title ?? publicPath,
  author,
  source,
  license,
  licenseUrl,
});
writeManifest(manifestFile, manifest);
console.log(`✓ ${publicPath} ${manifest[publicPath].width}×${manifest[publicPath].height}`);
execFileSync("npx", ["tsx", "scripts/photos/write-docs.ts"], { stdio: "inherit" });
