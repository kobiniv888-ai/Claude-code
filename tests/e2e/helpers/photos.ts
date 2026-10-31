import { randomInt } from "node:crypto";
import sharp from "sharp";

export type PhotoFile = { name: string; mimeType: string; buffer: Buffer };

/**
 * Generated JPEG "photos" for the wizard: each one a different random picture (so the
 * duplicate-photo check sees them as different), 1200×800 px, well above the minimum size.
 */
export async function makePhotos(count: number): Promise<PhotoFile[]> {
  const photos: PhotoFile[] = [];
  for (let i = 0; i < count; i += 1) {
    const shapes: string[] = [];
    for (let s = 0; s < 14; s += 1) {
      const color = `rgb(${randomInt(256)},${randomInt(256)},${randomInt(256)})`;
      if (s % 2 === 0) {
        shapes.push(`<rect x="${randomInt(1100)}" y="${randomInt(700)}" width="${80 + randomInt(500)}" height="${60 + randomInt(400)}" fill="${color}"/>`);
      } else {
        shapes.push(`<circle cx="${randomInt(1200)}" cy="${randomInt(800)}" r="${30 + randomInt(220)}" fill="${color}"/>`);
      }
    }
    const background = `rgb(${randomInt(256)},${randomInt(256)},${randomInt(256)})`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${background}"/>${shapes.join("")}</svg>`;
    const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
    photos.push({ name: `e2e-photo-${i + 1}.jpg`, mimeType: "image/jpeg", buffer });
  }
  return photos;
}
