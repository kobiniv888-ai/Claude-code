#!/usr/bin/env node
/**
 * Builds every app icon from the round-2 brand files (docs/redesign-2/BRIEF.md 3.1):
 *
 *   public/brand/bayit-app-icon.svg         white ב mark on a purple rounded square
 *   public/brand/bayit-app-icon-square.svg  the same, full-bleed, mark scaled into the safe zone
 *
 * Outputs:
 *   src/app/favicon.ico                    16/32/48 px (PNG entries; Next.js serves /favicon.ico)
 *   src/app/icon.svg                       scalable favicon for current browsers (the app icon)
 *   src/app/apple-icon.png                 180 px <link rel="apple-touch-icon"> (Next.js adds the tag)
 *   public/icons/favicon-32.png            32 px PNG favicon
 *   public/icons/apple-touch-icon.png      180 px, full-bleed (iOS rounds the corners itself)
 *   public/icons/icon-192.png, icon-512.png           PWA "any" icons (rounded square)
 *   public/icons/maskable-192.png, maskable-512.png   PWA "maskable" icons (full-bleed square)
 *
 * Share images (Open Graph) are drawn per page by next/og: src/app/[locale]/opengraph-image.tsx.
 * After replacing the brand SVGs, run:  node scripts/generate-icons.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "public", "brand");
const iconsDir = path.join(root, "public", "icons");
const appDir = path.join(root, "src", "app");

const appIcon = await fs.readFile(path.join(brandDir, "bayit-app-icon.svg"), "utf8");
const squareIcon = await fs.readFile(path.join(brandDir, "bayit-app-icon-square.svg"), "utf8");
// Apple: full bleed (iOS masks the corners; transparent corners would show black), at the mark size
// of the rounded icon (the square file shrinks the mark for Android's round masks).
const appleIcon = appIcon.replace(/ rx="[^"]*"/, "");
if (appleIcon === appIcon) throw new Error("bayit-app-icon.svg: expected a rounded <rect rx=…>");

/** Renders an SVG (viewBox 0 0 512 512) to a size × size PNG buffer, drawn at 4× and scaled down. */
function pngBuffer(svg, size) {
  return sharp(Buffer.from(svg), { density: Math.max(36, Math.ceil((72 * size * 4) / 512)) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function png(svg, size, file) {
  await fs.writeFile(file, await pngBuffer(svg, size));
  return file;
}

/**
 * A minimal .ico writer: a 6-byte header, one 16-byte directory entry per image, then the images as
 * PNG data (PNG-in-ICO is read by every current browser and by Windows since Vista).
 */
async function ico(svg, sizes, file) {
  const images = await Promise.all(sizes.map((size) => pngBuffer(svg, size)));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((data, i) => {
    const entry = 6 + 16 * i;
    const size = sizes[i];
    header.writeUInt8(size >= 256 ? 0 : size, entry); // width (0 = 256)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette colors
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8); // size of the PNG data
    header.writeUInt32LE(offset, entry + 12); // where it starts
    offset += data.length;
  });
  await fs.writeFile(file, Buffer.concat([header, ...images]));
  return file;
}

await fs.mkdir(iconsDir, { recursive: true });

const written = [
  await ico(appIcon, [16, 32, 48], path.join(appDir, "favicon.ico")),
  await png(appleIcon, 180, path.join(appDir, "apple-icon.png")),
  await png(appIcon, 32, path.join(iconsDir, "favicon-32.png")),
  await png(appleIcon, 180, path.join(iconsDir, "apple-touch-icon.png")),
  await png(appIcon, 192, path.join(iconsDir, "icon-192.png")),
  await png(appIcon, 512, path.join(iconsDir, "icon-512.png")),
  await png(squareIcon, 192, path.join(iconsDir, "maskable-192.png")),
  await png(squareIcon, 512, path.join(iconsDir, "maskable-512.png")),
];
await fs.writeFile(path.join(appDir, "icon.svg"), appIcon);
written.push(path.join(appDir, "icon.svg"));

for (const file of written) console.log(`✓ ${path.relative(root, file)}`);
