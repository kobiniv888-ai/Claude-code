/**
 * Shared helpers of the photo scripts (Node, no TypeScript): download with curl, optimize with
 * sharp (resize, WebP, no metadata), tiny blur placeholders, and the photo manifests.
 *
 * Manifests map a public path ("/photos/hero/tbilisi.webp") to { width, height, blurDataURL,
 * credit }. src/config/photos-manifest.json covers the site's photo slots (read by
 * src/config/photos.ts); prisma/seed/listings/photo-manifest.json covers the demo listings.
 * A slot whose file is not in its manifest shows the "photo coming soon" placeholder.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const SLOT_MANIFEST = path.join(ROOT, "src", "config", "photos-manifest.json");
export const LISTING_MANIFEST = path.join(ROOT, "prisma", "seed", "listings", "photo-manifest.json");
export const USER_AGENT = "BayitPhotoFetcher/1.0 (https://github.com/; one-off download of freely licensed photos)";

/** Hero photos are shown full-bleed; everything else is at most a large tile or a gallery photo. */
export const SIZES = {
  hero: { maxWidth: 2400, quality: 72 },
  default: { maxWidth: 1600, quality: 70 },
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Downloads a URL into a Buffer with curl (it honours HTTPS_PROXY and follows redirects). */
export function download(url, { userAgent = USER_AGENT, timeoutSeconds = 60 } = {}) {
  try {
    return execFileSync(
      "curl",
      ["--silent", "--show-error", "--fail", "--location", "--max-time", String(timeoutSeconds), "--user-agent", userAgent, url],
      { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    // "curl: (22) The requested URL returned error: 404" instead of the whole command line.
    const reason = String(error.stderr ?? "").trim().split("\n").pop() || "download failed";
    throw new Error(reason.replace(/^curl: \(\d+\) /, ""));
  }
}

/** Resizes (never enlarges), re-encodes as WebP and drops all metadata (EXIF, GPS, ICC). */
export async function optimize(input, { maxWidth, quality }) {
  const { data, info } = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/** A ~16 px wide blurred WebP as a data URL (for next/image placeholder="blur"). */
export async function blurDataURL(input) {
  const buffer = await sharp(input).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

/** Writes a photo to public/<publicPath> and returns its manifest entry. */
export async function savePhoto(input, publicPath, size, credit) {
  const { buffer, width, height } = await optimize(input, size);
  const file = path.join(PUBLIC_DIR, publicPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return { width, height, bytes: buffer.length, blurDataURL: await blurDataURL(buffer), ...(credit ? { credit } : {}) };
}

/** Manifest entry for a file that is already optimized (no re-encoding). */
export async function describePhoto(publicPath, credit) {
  const file = path.join(PUBLIC_DIR, publicPath);
  const buffer = fs.readFileSync(file);
  const meta = await sharp(buffer).metadata();
  return { width: meta.width, height: meta.height, bytes: buffer.length, blurDataURL: await blurDataURL(buffer), ...(credit ? { credit } : {}) };
}

export function readManifest(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** Sorted keys so re-runs give a stable diff. */
export function writeManifest(file, manifest) {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

export function fileExists(publicPath) {
  return fs.existsSync(path.join(PUBLIC_DIR, publicPath));
}

export const LICENSES = {
  unsplash: { name: "Unsplash License", url: "https://unsplash.com/license" },
  pexels: { name: "Pexels License", url: "https://www.pexels.com/license/" },
  cc0: { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  pd: { name: "Public domain", url: "https://commons.wikimedia.org/wiki/Commons:Licensing" },
  "cc-by-2.0": { name: "CC BY 2.0", url: "https://creativecommons.org/licenses/by/2.0/" },
  "cc-by-4.0": { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  "cc-by-sa-2.0": { name: "CC BY-SA 2.0", url: "https://creativecommons.org/licenses/by-sa/2.0/" },
  "cc-by-sa-3.0": { name: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
  "cc-by-sa-4.0": { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
};

/** True when the license asks for a visible credit (CC BY / BY-SA). */
export function needsAttribution(license) {
  return /^CC BY/.test(license);
}
