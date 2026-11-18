/**
 * Downloads the demo listings' stock photos (Unsplash License) into
 * public/photos/listings/<NN>-<city>-<neighborhood>/<key>.webp (max 1600 px, WebP q70, no
 * metadata) and records size + blur placeholder + source in prisma/seed/listings/photo-manifest.json,
 * which the seed reads. Safe to re-run (existing files are kept unless --force); files of
 * listings that no longer exist are deleted.
 *
 *   npx tsx scripts/photos/fetch-demo-photos.ts [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { ALL_LISTINGS, demoPhotoFolder, demoPhotoPath } from "../../prisma/seed/listings/all";
import { PHOTOS } from "../../prisma/seed/listings/photos";
import { download, fileExists, LICENSES, LISTING_MANIFEST, PUBLIC_DIR, readManifest, savePhoto, SIZES, sleep, writeManifest } from "./lib.mjs";

type Entry = { width: number; height: number; bytes: number; blurDataURL: string; credit?: Record<string, string> };

async function main() {
  const force = process.argv.includes("--force");
  const old = readManifest(LISTING_MANIFEST) as Record<string, Entry>;
  const manifest: Record<string, Entry> = {};
  let failed = 0;

  for (const seed of ALL_LISTINGS) {
    for (const key of seed.photos) {
      const publicPath = demoPhotoPath(seed, key);
      if (!force && fileExists(publicPath) && old[publicPath]) {
        manifest[publicPath] = old[publicPath];
        continue;
      }
      const id = PHOTOS[key];
      const source = `https://images.unsplash.com/${id}`;
      try {
        const original = download(`${source}?w=1600&q=85&fm=jpg`);
        manifest[publicPath] = await savePhoto(original, publicPath, SIZES.default, {
          title: `Demo listing photo (${key})`,
          author: "Unsplash contributor",
          source,
          license: LICENSES.unsplash.name,
          licenseUrl: LICENSES.unsplash.url,
        });
        console.log(`  ✓ ${publicPath} ${Math.round(manifest[publicPath].bytes / 1024)} KB`);
        await sleep(150);
      } catch (error) {
        failed++;
        console.error(`  ✗ ${publicPath}: ${(error as Error).message.split("\n")[0]}`);
      }
    }
  }

  // Remove folders and files that no demo listing uses any more.
  const wanted = new Set(Object.keys(manifest));
  const folders = new Set(ALL_LISTINGS.map((seed) => demoPhotoFolder(seed)));
  const root = path.join(PUBLIC_DIR, "photos", "listings");
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const folder = `/photos/listings/${dir}`;
    if (!folders.has(folder)) {
      fs.rmSync(path.join(root, dir), { recursive: true });
      console.log(`  - removed ${folder}`);
      continue;
    }
    for (const file of fs.readdirSync(path.join(root, dir))) {
      if (!wanted.has(`${folder}/${file}`)) {
        fs.rmSync(path.join(root, dir, file));
        console.log(`  - removed ${folder}/${file}`);
      }
    }
  }

  writeManifest(LISTING_MANIFEST, manifest);
  const total = Object.values(manifest).reduce((sum, e) => sum + e.bytes, 0);
  console.log(`${Object.keys(manifest).length} photos, ${(total / 1024 / 1024).toFixed(1)} MB${failed ? `, ${failed} failed` : ""}.`);
  process.exitCode = failed ? 1 : 0;
}

void main();
