#!/usr/bin/env node
/**
 * Makes tests/fixtures/heic/gps-photo.heic: a small, made-up HEIC "iPhone photo" that carries
 * a GPS position, a camera model and an XMP block (SECURITY_REPORT 9.a / 9.g, founder's answer
 * (e)). The image tests decode it with heic-decode and prove that none of that metadata reaches
 * a stored image.
 *
 * Nothing is downloaded: the picture is drawn here with sharp, encoded to HEVC with the local
 * ffmpeg (libx265), and wrapped in a HEIF container written by this script (ftyp, meta with
 * hdlr/pitm/iinf/iref/iprp/iloc, mdat), like an iPhone does: the primary image is an 'hvc1' item,
 * EXIF is an 'Exif' item and XMP a 'mime' item, both linked to the image with 'cdsc'.
 *
 *   node tests/fixtures/heic/make-gps-heic.mjs     (needs ffmpeg with libx265; dev only)
 *
 * The output is committed, so the tests need neither ffmpeg nor this script. Fake data only:
 * the position is a made-up point and the model "FixturePhone 15" does not exist.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "gps-photo.heic");
const WIDTH = 480;
const HEIGHT = 400;
export const FIXTURE_MODEL = "FixturePhone 15";
export const FIXTURE_XMP_MARK = "exif:GPSLatitude";

// ─── The picture: a few coloured blocks (asymmetric, so a rotation would show) ─────────────
const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const i = (y * WIDTH + x) * 3;
    const left = x < WIDTH / 2;
    const top = y < HEIGHT / 2;
    pixels[i] = top && left ? 220 : 40;
    pixels[i + 1] = top && !left ? 200 : 60 + Math.round((x / WIDTH) * 80);
    pixels[i + 2] = !top ? 210 : 50;
  }
}
const png = await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer();

// ─── EXIF (TIFF) with GPS, taken from a JPEG that sharp writes ───────────────────────────────
const exifJpeg = await sharp(png)
  .jpeg()
  .withExif({
    IFD0: { Make: "FixtureCam", Model: FIXTURE_MODEL },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 42/1 5/1", GPSLongitudeRef: "E", GPSLongitude: "44/1 49/1 37/1" },
  })
  .toBuffer();
function exifTiff(jpeg) {
  for (let i = 2; i + 4 < jpeg.length; ) {
    if (jpeg[i] !== 0xff) throw new Error("bad JPEG marker");
    const marker = jpeg[i + 1];
    const length = jpeg.readUInt16BE(i + 2);
    if (marker === 0xe1 && jpeg.toString("latin1", i + 4, i + 10) === "Exif\0\0") return jpeg.subarray(i + 10, i + 2 + length);
    i += 2 + length;
  }
  throw new Error("no EXIF segment");
}
const tiff = exifTiff(exifJpeg);
// HEIF Exif item: 4-byte offset to the TIFF header, then "Exif\0\0", then the TIFF block.
const exifItem = Buffer.concat([Buffer.from([0, 0, 0, 6]), Buffer.from("Exif\0\0", "latin1"), tiff]);
const xmpItem = Buffer.from(
  `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:tiff="http://ns.adobe.com/tiff/1.0/" ` +
    `${FIXTURE_XMP_MARK}="41,42.08N" exif:GPSLongitude="44,49.62E" tiff:Model="${FIXTURE_MODEL}"/>` +
    `</rdf:RDF></x:xmpmeta>`,
  "utf8",
);

// ─── HEVC with the local ffmpeg ──────────────────────────────────────────────────────────────
const work = mkdtempSync(path.join(tmpdir(), "heic-fixture-"));
let annexB;
try {
  writeFileSync(path.join(work, "in.png"), png);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", path.join(work, "in.png"),
    "-frames:v", "1", "-c:v", "libx265", "-pix_fmt", "yuv420p",
    "-x265-params", "log-level=error:keyint=1:info=0",
    "-f", "hevc", path.join(work, "out.hevc"),
  ]);
  annexB = readFileSync(path.join(work, "out.hevc"));
} finally {
  rmSync(work, { recursive: true, force: true });
}

/** Splits an Annex-B stream at its 00 00 01 start codes. */
function nalUnits(stream) {
  const starts = [];
  for (let i = 0; i + 3 <= stream.length; i++) {
    if (stream[i] === 0 && stream[i + 1] === 0 && stream[i + 2] === 1) {
      starts.push(i + 3);
      i += 2;
    }
  }
  return starts.map((start, n) => {
    let end = n + 1 < starts.length ? starts[n + 1] - 3 : stream.length;
    while (end > start && stream[end - 1] === 0) end--; // the 4-byte start code's leading zero
    return stream.subarray(start, end);
  });
}
const nals = nalUnits(annexB);
const typeOf = (nal) => (nal[0] >> 1) & 0x3f;
const vps = nals.filter((n) => typeOf(n) === 32);
const sps = nals.filter((n) => typeOf(n) === 33);
const pps = nals.filter((n) => typeOf(n) === 34);
const slices = nals.filter((n) => typeOf(n) < 32);
if (!vps.length || !sps.length || !pps.length || !slices.length) throw new Error("unexpected HEVC stream");

/** SPS payload without emulation-prevention bytes, to copy its profile/tier/level. */
function rbsp(nal) {
  const out = [];
  for (let i = 2; i < nal.length; i++) {
    if (i >= 4 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
    out.push(nal[i]);
  }
  return Buffer.from(out);
}
const ptl = rbsp(sps[0]).subarray(1, 13); // profile space/tier/idc, 4 compat, 6 constraint, level

// ─── ISO-BMFF boxes ──────────────────────────────────────────────────────────────────────────
const u8 = (v) => Buffer.from([v]);
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]); };
const fullBox = (type, version, flags, ...parts) => box(type, u8(version), u8((flags >> 16) & 255), u8((flags >> 8) & 255), u8(flags & 255), ...parts);
const cstr = (s) => Buffer.from(`${s}\0`, "utf8");

const hvcC = box(
  "hvcC",
  u8(1),
  ptl, // general_profile_space..general_level_idc (12 bytes)
  u16(0xf000), // reserved + min_spatial_segmentation_idc 0
  u8(0xfc), // reserved + parallelismType 0
  u8(0xfc | 1), // reserved + chroma_format_idc 1 (4:2:0)
  u8(0xf8), // reserved + bit_depth_luma_minus8 0
  u8(0xf8), // reserved + bit_depth_chroma_minus8 0
  u16(0), // avgFrameRate
  u8((0 << 6) | (1 << 3) | (1 << 2) | 3), // constantFrameRate 0, numTemporalLayers 1, temporalIdNested 1, lengthSizeMinusOne 3
  u8(3),
  ...[
    [32, vps],
    [33, sps],
    [34, pps],
  ].map(([type, list]) => Buffer.concat([u8(0x80 | type), u16(list.length), ...list.flatMap((nal) => [u16(nal.length), nal])])),
);
const ispe = fullBox("ispe", 0, 0, u32(WIDTH), u32(HEIGHT));
const imageData = Buffer.concat(slices.flatMap((nal) => [u32(nal.length), nal]));

const ftyp = box("ftyp", Buffer.from("heic", "latin1"), u32(0), Buffer.from("mif1heicmiaf", "latin1"));

/** meta box; the iloc offsets point into mdat, which follows ftyp + meta. */
function metaBox(mdatPayloadStart) {
  const items = [
    { id: 1, data: imageData },
    { id: 2, data: exifItem },
    { id: 3, data: xmpItem },
  ];
  let offset = mdatPayloadStart;
  const extents = items.map((item) => {
    const extent = { ...item, offset };
    offset += item.data.length;
    return extent;
  });
  return fullBox(
    "meta",
    0,
    0,
    fullBox("hdlr", 0, 0, u32(0), Buffer.from("pict", "latin1"), u32(0), u32(0), u32(0), cstr("")),
    fullBox("pitm", 0, 0, u16(1)),
    fullBox(
      "iinf",
      0,
      0,
      u16(3),
      fullBox("infe", 2, 0, u16(1), u16(0), Buffer.from("hvc1", "latin1"), cstr("")),
      fullBox("infe", 2, 0, u16(2), u16(0), Buffer.from("Exif", "latin1"), cstr("")),
      fullBox("infe", 2, 0, u16(3), u16(0), Buffer.from("mime", "latin1"), cstr(""), cstr("application/rdf+xml")),
    ),
    fullBox("iref", 0, 0, box("cdsc", u16(2), u16(1), u16(1)), box("cdsc", u16(3), u16(1), u16(1))),
    box("iprp", box("ipco", hvcC, ispe), fullBox("ipma", 0, 0, u32(1), u16(1), u8(2), u8(0x81), u8(0x02))),
    fullBox(
      "iloc",
      0,
      0,
      u8((4 << 4) | 4), // offset_size 4, length_size 4
      u8(0), // base_offset_size 0, reserved
      u16(extents.length),
      ...extents.map((e) => Buffer.concat([u16(e.id), u16(0), u16(1), u32(e.offset), u32(e.data.length)])),
    ),
  );
}

const metaSize = metaBox(0).length;
const meta = metaBox(ftyp.length + metaSize + 8);
const mdat = box("mdat", imageData, exifItem, xmpItem);
const file = Buffer.concat([ftyp, meta, mdat]);
writeFileSync(OUT, file);
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${file.length} bytes, ${WIDTH}×${HEIGHT})`);
