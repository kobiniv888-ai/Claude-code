#!/usr/bin/env node
/**
 * Builds every app icon from the brand mark (public/brand/logo-mark.svg):
 *
 *   public/icons/icon-192.png, icon-512.png       PWA icons ("any": the rounded tile)
 *   public/icons/maskable-192.png, maskable-512.png PWA icons ("maskable": full-bleed, glyph in the safe zone)
 *   public/icons/apple-touch-icon.png             iOS home screen (180×180, full-bleed — iOS rounds the corners)
 *   public/icons/favicon-32.png                   PNG favicon
 *   src/app/favicon.ico                           16/32/48 px favicon (Next.js serves it at /favicon.ico)
 *   src/app/icon.svg                              scalable favicon for modern browsers (a copy of the mark)
 *   src/app/apple-icon.png                        <link rel="apple-touch-icon"> (Next.js adds the tag)
 *   public/brand/og-default.png                   default social sharing image (1200×630)
 *
 * After replacing the logo SVGs, run:  node scripts/generate-icons.mjs
 * The mark SVG must keep a <rect id="tile" fill="…"> and a <g id="glyph">…</g> (see the file).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "public", "brand");
const iconsDir = path.join(root, "public", "icons");

const markSvg = await fs.readFile(path.join(brandDir, "logo-mark.svg"), "utf8");
const wordmarkSvg = await fs.readFile(path.join(brandDir, "logo.svg"), "utf8");

function extract(source, pattern, what) {
  const match = pattern.exec(source);
  if (!match) throw new Error(`logo-mark.svg: could not find ${what}`);
  return match[1];
}

const defs = /<defs>([\s\S]*?)<\/defs>/.exec(markSvg)?.[1] ?? "";
const tileFill = extract(markSvg, /<rect[^>]*id="tile"[^>]*fill="([^"]+)"/, '<rect id="tile" fill="…">');
const glyph = extract(markSvg, /<g id="glyph">([\s\S]*?)<\/g>/, '<g id="glyph">');
const wordmarkText = extract(wordmarkSvg, /(<path id="wordmark-text"[^>]*\/>)/, '<path id="wordmark-text">');

/** The glyph on a full-bleed square background, scaled around the center. */
function fullBleedSvg(scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${defs}</defs>
  <rect width="64" height="64" fill="${tileFill}"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${glyph}</g>
</svg>`;
}

/** Default Open Graph image: the wordmark on the off-white brand background with soft color glows. */
function ogSvg() {
  const width = 1200;
  const height = 630;
  const logoScale = 3.4;
  const logoWidth = 138 * logoScale;
  const logoHeight = 42 * logoScale;
  const x = (width - logoWidth) / 2;
  const y = (height - logoHeight) / 2 - 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    ${defs}
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="#FAF8F5"/>
  <circle cx="1060" cy="40" r="260" fill="#B4533A" opacity="0.16" filter="url(#glow)"/>
  <circle cx="120" cy="620" r="300" fill="#1E3A6E" opacity="0.14" filter="url(#glow)"/>
  <g transform="translate(${x} ${y}) scale(${logoScale})">
    <g transform="translate(0 0.5) scale(0.625)">
      <rect width="64" height="64" rx="16" fill="${tileFill}"/>
      ${glyph}
    </g>
    ${wordmarkText}
  </g>
  <rect x="${width / 2 - 36}" y="${y + logoHeight + 44}" width="72" height="6" rx="3" fill="#B4533A"/>
</svg>`;
}

async function png(svg, size, file, { density } = {}) {
  await sharp(Buffer.from(svg), { density: density ?? Math.max(72, Math.ceil((72 * size) / 64) * 2) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file);
  return file;
}

/** A .ico file holding PNG images (supported by every current browser). */
async function ico(svg, sizes, file) {
  const images = await Promise.all(
    sizes.map((size) =>
      sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 64) * 4 })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer(),
    ),
  );
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((data, i) => {
    const entry = 6 + 16 * i;
    const size = sizes[i];
    header.writeUInt8(size >= 256 ? 0 : size, entry); // width
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette colors
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  await fs.writeFile(file, Buffer.concat([header, ...images]));
  return file;
}

await fs.mkdir(iconsDir, { recursive: true });

const written = [
  await png(markSvg, 192, path.join(iconsDir, "icon-192.png")),
  await png(markSvg, 512, path.join(iconsDir, "icon-512.png")),
  await png(fullBleedSvg(0.82), 192, path.join(iconsDir, "maskable-192.png")),
  await png(fullBleedSvg(0.82), 512, path.join(iconsDir, "maskable-512.png")),
  await png(fullBleedSvg(1), 180, path.join(iconsDir, "apple-touch-icon.png")),
  await png(markSvg, 32, path.join(iconsDir, "favicon-32.png")),
  await ico(markSvg, [16, 32, 48], path.join(root, "src", "app", "favicon.ico")),
  await png(fullBleedSvg(1), 180, path.join(root, "src", "app", "apple-icon.png")),
];

await fs.writeFile(path.join(root, "src", "app", "icon.svg"), markSvg);
written.push(path.join(root, "src", "app", "icon.svg"));

await sharp(Buffer.from(ogSvg()), { density: 72 })
  .png({ compressionLevel: 9 })
  .toFile(path.join(brandDir, "og-default.png"));
written.push(path.join(brandDir, "og-default.png"));

for (const file of written) console.log(`✓ ${path.relative(root, file)}`);
