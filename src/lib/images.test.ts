import { readFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import sharp, { type Sharp } from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The HEIC decode limit (per user per hour) is a database counter; here it only records its calls.
const rateLimit = vi.hoisted(() => ({ calls: [] as string[], refuse: false }));
vi.mock("@/lib/rate-limit", async () => {
  const { RateLimitError } = await import("@/lib/errors");
  return {
    assertRateLimit: async (key: string) => {
      rateLimit.calls.push(key);
      if (rateLimit.refuse) throw new RateLimitError(new Date(Date.now() + 60_000));
      return { ok: true, remaining: 1, resetAt: new Date() };
    },
  };
});

const {
  checkPdf,
  hammingDistance,
  ImageValidationError,
  MAX_HEIC_PIXELS,
  perceptualHash,
  prepareUploadImage,
  processCityPhoto,
  processListingPhoto,
  processPrivateImage,
  sniffImageFormat,
  validateImage,
} = await import("./images");
const { processAvatar } = await import("./account/avatar");

/**
 * A made-up iPhone HEIC photo (480×400) with a GPS position, the camera model "FixturePhone 15" and
 * an XMP block naming exif:GPSLatitude: made by tests/fixtures/heic/make-gps-heic.mjs (ffmpeg +
 * libx265, nothing downloaded); its EXIF also reads back with the independent go4.org HEIF parser.
 */
const HEIC_FIXTURE = readFileSync(path.join(__dirname, "../../tests/fixtures/heic/gps-photo.heic"));
const FIXTURE_MODEL = "FixturePhone 15";

/** Seeded PRNG so the generated test images are the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return s / 4294967296;
  };
}

/** A "photo" made of 16×12 random colour blocks (stable under re-encoding, unique per seed). */
async function blockImage(seed: number, width = 1600, height = 1200): Promise<Sharp> {
  const random = rng(seed);
  const cols = 16;
  const rows = 12;
  const cells = Buffer.alloc(cols * rows * 3);
  for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(random() * 256);
  const small = await sharp(cells, { raw: { width: cols, height: rows, channels: 3 } }).png().toBuffer();
  return sharp(small).resize(width, height, { kernel: "nearest" });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ImageValidationError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("sniffImageFormat", () => {
  it("recognises allowed formats by their magic bytes", async () => {
    const img = await blockImage(1, 64, 64);
    expect(sniffImageFormat(await img.clone().jpeg().toBuffer())).toBe("jpeg");
    expect(sniffImageFormat(await img.clone().png().toBuffer())).toBe("png");
    expect(sniffImageFormat(await img.clone().webp().toBuffer())).toBe("webp");
    expect(sniffImageFormat(await img.clone().gif().toBuffer())).toBe("gif");
    expect(sniffImageFormat(await img.clone().avif().toBuffer())).toBe("avif");
  });

  it("refuses SVG, PDF, TIFF and text", async () => {
    expect(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageFormat(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj"))).toBeNull();
    expect(sniffImageFormat(await (await blockImage(1, 64, 64)).tiff().toBuffer())).toBeNull();
    expect(sniffImageFormat(Buffer.from("hello world, not an image"))).toBeNull();
  });
});

describe("validateImage", () => {
  it("accepts a normal photo and reports its displayed size", async () => {
    const jpeg = await (await blockImage(2, 1200, 900)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    // Orientation 6 = rotated 90°: displayed portrait.
    await expect(validateImage(jpeg)).resolves.toEqual({ format: "jpeg", width: 900, height: 1200 });
  });

  it("accepts JPEG, PNG and WebP", async () => {
    const img = await blockImage(3, 640, 480);
    await expect(validateImage(await img.clone().jpeg().toBuffer())).resolves.toMatchObject({ format: "jpeg" });
    await expect(validateImage(await img.clone().png().toBuffer())).resolves.toMatchObject({ format: "png" });
    await expect(validateImage(await img.clone().webp().toBuffer())).resolves.toMatchObject({ format: "webp" });
  });

  // SECURITY_REPORT 9.a: JPEG, PNG and WebP only (founder's answers L7 and Q2: AVIF off).
  it("refuses AVIF and GIF from their bytes, before any decoder runs", async () => {
    const img = await blockImage(3, 640, 480);
    await expectCode(validateImage(await img.clone().avif().toBuffer()), "file_type_not_allowed");
    await expectCode(validateImage(await img.clone().gif().toBuffer()), "file_type_not_allowed");
  });

  it("refuses raw HEIC with its own code (prepareUploadImage converts HEIC before validateImage)", async () => {
    for (const brand of ["heic", "heix", "mif1"]) {
      const box = Buffer.alloc(24);
      box.writeUInt32BE(24, 0);
      box.write(`ftyp${brand}`, 4, "latin1");
      box.write("mif1heic", 16, "latin1");
      const heic = Buffer.concat([box, Buffer.alloc(2048, 1)]);
      expect(sniffImageFormat(heic), brand).toBe("heic");
      await expectCode(validateImage(heic), "heic_not_supported");
    }
    expect(new ImageValidationError("heic_not_supported").status).toBe(415);
  });

  it("refuses photos that are too small, too large, of another type or broken", async () => {
    const tiny = await (await blockImage(4, 600, 300)).jpeg().toBuffer();
    await expectCode(validateImage(tiny), "image_too_small");

    const big = await (await blockImage(4, 1200, 900)).png().toBuffer();
    await expectCode(validateImage(big, { maxBytes: 1000 }), "file_too_large");

    await expectCode(validateImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"/>')), "file_type_not_allowed");

    const truncated = (await (await blockImage(5, 1200, 900)).jpeg().toBuffer()).subarray(0, 2000);
    await expectCode(validateImage(truncated), "image_corrupt");

    await expectCode(validateImage(Buffer.alloc(0)), "image_corrupt");
  });
});

describe("processListingPhoto", () => {
  it("re-encodes all sizes and removes EXIF / GPS data", async () => {
    const source = await (await blockImage(6, 2400, 1800))
      .jpeg({ quality: 92 })
      .withExif({
        IFD0: { Make: "TestCam", Model: "Secret Model", Copyright: "Owner" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 42/1 5/1", GPSLongitudeRef: "E", GPSLongitude: "44/1 49/1 37/1" },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const sourceMeta = await sharp(source).metadata();
    expect(sourceMeta.exif).toBeDefined();
    expect(sourceMeta.exif!.toString("latin1")).toContain("Secret Model");

    const result = await processListingPhoto(source);

    // Orientation applied (portrait), longest side 1600.
    expect(result.width).toBe(1200);
    expect(result.height).toBe(1600);

    for (const [name, buffer, format] of [
      ["lg", result.lg, "webp"],
      ["md", result.md, "webp"],
      ["sm", result.sm, "webp"],
      ["og", result.og, "jpeg"],
    ] as const) {
      const meta = await sharp(buffer).metadata();
      expect(meta.format, name).toBe(format);
      expect(meta.exif, `${name} exif`).toBeUndefined();
      expect(meta.xmp, `${name} xmp`).toBeUndefined();
      expect(meta.iptc, `${name} iptc`).toBeUndefined();
      expect(meta.orientation, `${name} orientation`).toBeUndefined();
      expect(buffer.toString("latin1")).not.toContain("Secret Model");
      expect(buffer.toString("latin1")).not.toContain("GPS");
    }

    const md = await sharp(result.md).metadata();
    expect(Math.max(md.width, md.height)).toBe(800);
    const sm = await sharp(result.sm).metadata();
    expect(Math.max(sm.width, sm.height)).toBe(400);
    const og = await sharp(result.og).metadata();
    expect([og.width, og.height]).toEqual([1200, 630]);

    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
    expect(result.blurDataUrl.length).toBeLessThan(600);
    expect(result.phash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("adds a watermark in the bottom-right corner of lg (not elsewhere)", async () => {
    const grey = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 128, g: 128, b: 128 } } })
      .jpeg({ quality: 95 })
      .toBuffer();
    const { lg, width, height } = await processListingPhoto(grey);
    const region = async (left: number, top: number) => {
      // stats() reads the input image, so extract into a buffer first.
      const part = await sharp(lg)
        .extract({ left, top, width: Math.round(width / 4), height: Math.round(height / 6) })
        .png()
        .toBuffer();
      return (await sharp(part).stats()).channels[0];
    };
    const topLeft = await region(0, 0);
    const bottomRight = await region(width - Math.round(width / 4), height - Math.round(height / 6));
    expect(topLeft.max - topLeft.min).toBeLessThan(10);
    expect(bottomRight.max - bottomRight.min).toBeGreaterThan(30);
  });

  it("does not upscale small photos", async () => {
    const source = await (await blockImage(7, 800, 600)).png().toBuffer();
    const result = await processListingPhoto(source);
    expect([result.width, result.height]).toEqual([800, 600]);
  });
});

describe("perceptual hash", () => {
  it("matches re-encoded copies of one photo and not a different photo", async () => {
    const original = await blockImage(42);
    const copyA = await original.clone().jpeg({ quality: 90 }).toBuffer();
    const copyB = await original.clone().resize(700).webp({ quality: 55 }).toBuffer();
    const other = await (await blockImage(43)).jpeg({ quality: 90 }).toBuffer();

    const [hashA, hashB, hashOther] = await Promise.all([perceptualHash(copyA), perceptualHash(copyB), perceptualHash(other)]);
    expect(hammingDistance(hashA, hashB)).toBeLessThanOrEqual(6);
    expect(hammingDistance(hashA, hashOther)).toBeGreaterThan(6);
  });

  it("gives the same hash after processing as for the upload", async () => {
    const source = await (await blockImage(44)).jpeg({ quality: 88 }).toBuffer();
    const processed = await processListingPhoto(source);
    expect(hammingDistance(processed.phash, await perceptualHash(source))).toBeLessThanOrEqual(6);
    // A watermarked copy downloaded from the site still matches.
    expect(hammingDistance(processed.phash, await perceptualHash(processed.lg))).toBeLessThanOrEqual(6);
  });

  it("counts differing bits", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("00000000000000ff", "000000000000000f")).toBe(4);
    expect(hammingDistance("ABCDEF0123456789", "abcdef0123456789")).toBe(0);
    expect(hammingDistance("bad", "0000000000000000")).toBe(64);
  });
});

describe("processPrivateImage", () => {
  it("re-encodes to JPEG without metadata and limits the size", async () => {
    const source = await (await blockImage(8, 3000, 2000))
      .png()
      .withExif({ IFD0: { Model: "Secret Model" } })
      .toBuffer();
    const { body, contentType, width, height } = await processPrivateImage(source);
    expect(contentType).toBe("image/jpeg");
    expect([width, height]).toEqual([2400, 1600]);
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
  });
});

// SECURITY_REPORT 9.g / 9.a, founder's answer (e): no stored image keeps EXIF, GPS, XMP or the camera
// model, whichever pipeline stores it (public listing photos, public avatars, public city photos,
// private documents and screenshots) and whether it came as JPEG or as an iPhone HEIC photo.
describe("every stored image loses its metadata", () => {
  const GPS_XMP =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="41,42.08N" exif:GPSLongitude="44,49.62E"/>' +
    "</rdf:RDF></x:xmpmeta>";

  /** A landscape JPEG (1200×800 as stored) with orientation 6, so it is displayed as portrait 800×1200. */
  async function gpsJpeg(): Promise<Buffer> {
    return (await blockImage(9, 1200, 800))
      .jpeg({ quality: 92 })
      .withExif({
        IFD0: { Make: "TestCam", Model: "Secret Model" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 42/1 5/1", GPSLongitudeRef: "E", GPSLongitude: "44/1 49/1 37/1" },
      })
      .withMetadata({ orientation: 6 })
      .withXmp(GPS_XMP)
      .toBuffer();
  }

  const pipelines: Array<[string, (buffer: Buffer) => Promise<Buffer[]>]> = [
    ["listing photo (lg, md, sm, og)", async (b) => Object.values(await processListingPhoto(b)).filter(Buffer.isBuffer)],
    ["private image", async (b) => [(await processPrivateImage(b)).body]],
    ["avatar", async (b) => [await processAvatar(b, "user-1")]],
    ["city photo", async (b) => [await processCityPhoto(b)]],
  ];

  async function expectClean(outputs: Buffer[], secrets: string[]) {
    expect(outputs.length).toBeGreaterThan(0);
    for (const output of outputs) {
      const meta = await sharp(output).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      const bytes = output.toString("latin1");
      for (const secret of ["GPS", ...secrets]) expect(bytes).not.toContain(secret);
    }
  }

  it("the JPEG fixture really carries EXIF GPS, the model and XMP GPS", async () => {
    const meta = await sharp(await gpsJpeg()).metadata();
    expect(meta.exif?.toString("latin1")).toContain("Secret Model");
    // The GPS IFD pointer (tag 0x8825, little-endian) and the latitude reference "N".
    expect(meta.exif?.includes(Buffer.from([0x25, 0x88]))).toBe(true);
    expect(meta.xmp?.toString("utf8")).toContain("exif:GPSLatitude");
    expect(meta.orientation).toBe(6);
  });

  it.each(pipelines)("%s from a JPEG with GPS: metadata removed, orientation applied", async (_name, run) => {
    const prepared = await prepareUploadImage(await gpsJpeg(), { userId: "user-1", minShortSide: 16 });
    expect(prepared.source).toBe("jpeg");
    const outputs = await run(prepared.buffer);
    await expectClean(outputs, ["Secret Model", "TestCam", "exif:GPSLatitude"]);
    for (const output of outputs) expect(output.includes(Buffer.from([0x25, 0x88, 0x04, 0x00]))).toBe(false);
    // Portrait after orientation 6 (the avatar is a square crop, the og image a fixed 1200×630 crop).
    const first = await sharp(outputs[0]).metadata();
    if (first.width !== first.height && !(first.width === 1200 && first.height === 630)) expect(first.height).toBeGreaterThan(first.width);
  });

  it("the HEIC fixture really carries GPS, the model and XMP GPS", () => {
    expect(sniffImageFormat(HEIC_FIXTURE)).toBe("heic");
    const bytes = HEIC_FIXTURE.toString("latin1");
    expect(bytes).toContain("GPS");
    expect(bytes).toContain(FIXTURE_MODEL);
    expect(bytes).toContain("exif:GPSLatitude");
  });

  it.each(pipelines)("%s from an iPhone HEIC with GPS: decoded on the server, metadata removed", async (_name, run) => {
    rateLimit.calls.length = 0;
    const prepared = await prepareUploadImage(HEIC_FIXTURE, { userId: "user-1", minShortSide: 16 });
    expect(prepared.source).toBe("heic");
    expect(prepared.info).toEqual({ format: "png", width: 480, height: 400 });
    expect(rateLimit.calls).toEqual(["upload:heic:user-1"]);
    await expectClean([prepared.buffer], [FIXTURE_MODEL, "exif:GPSLatitude"]);
    await expectClean(await run(prepared.buffer), [FIXTURE_MODEL, "exif:GPSLatitude"]);
  });

  it("keeps the HEIC picture itself (colours of its four quarters)", async () => {
    const { buffer } = await prepareUploadImage(HEIC_FIXTURE, { userId: "user-1", minShortSide: 16 });
    const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    const near = (actual: number[], expected: number[]) => actual.every((v, i) => Math.abs(v - expected[i]) <= 24);
    expect(near(at(40, 40), [220, 70, 50]), `top left ${at(40, 40)}`).toBe(true);
    expect(near(at(440, 40), [40, 200, 50]), `top right ${at(440, 40)}`).toBe(true);
    expect(near(at(40, 360), [40, 66, 210]), `bottom left ${at(40, 360)}`).toBe(true);
  });
});

describe("prepareUploadImage (HEIC limits)", () => {
  beforeEach(() => {
    rateLimit.calls.length = 0;
    rateLimit.refuse = false;
  });

  it("passes JPEG, PNG and WebP straight to validateImage (no HEIC decode, no HEIC limit)", async () => {
    const png = await (await blockImage(10, 640, 480)).png().toBuffer();
    const prepared = await prepareUploadImage(png, { userId: "user-1" });
    expect(prepared).toMatchObject({ buffer: png, source: "png", info: { format: "png", width: 640, height: 480 } });
    expect(rateLimit.calls).toEqual([]);
  });

  it("checks the file size before decoding, and the short side after", async () => {
    await expectCode(prepareUploadImage(HEIC_FIXTURE, { userId: "user-1", maxBytes: 100 }), "file_too_large");
    expect(rateLimit.calls).toEqual([]);
    // The fixture's short side is 400 px: exactly the gallery minimum passes, one more does not.
    await expectCode(prepareUploadImage(HEIC_FIXTURE, { userId: "user-1", minShortSide: 401 }), "image_too_small");
  });

  it("refuses a HEIC that announces more than MAX_HEIC_PIXELS before decoding it", async () => {
    // Rewrite the picture size the file announces ('ispe') to 10000×10000.
    const big = Buffer.from(HEIC_FIXTURE);
    const at = big.indexOf("ispe", 0, "latin1");
    expect(at).toBeGreaterThan(0);
    big.writeUInt32BE(10_000, at + 8);
    big.writeUInt32BE(10_000, at + 12);
    expect(10_000 * 10_000).toBeGreaterThan(MAX_HEIC_PIXELS);
    await expectCode(prepareUploadImage(big, { userId: "user-1" }), "file_too_large");
  });

  it("answers a broken HEIC with the friendly heic_not_supported message", async () => {
    const box = Buffer.alloc(24);
    box.writeUInt32BE(24, 0);
    box.write("ftypheic", 4, "latin1");
    box.write("mif1heic", 16, "latin1");
    await expectCode(prepareUploadImage(Buffer.concat([box, Buffer.alloc(2048, 1)]), { userId: "user-1" }), "heic_not_supported");
    const truncated = HEIC_FIXTURE.subarray(0, Math.floor(HEIC_FIXTURE.length * 0.8));
    await expect(prepareUploadImage(truncated, { userId: "user-1" })).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("stops at the per-user decode limit (fail closed: no decode when the counter refuses)", async () => {
    rateLimit.refuse = true;
    await expect(prepareUploadImage(HEIC_FIXTURE, { userId: "user-2" })).rejects.toMatchObject({ code: "rate_limited" });
    expect(rateLimit.calls).toEqual(["upload:heic:user-2"]);
  });

  it("still refuses AVIF and GIF (only HEIC is converted)", async () => {
    const img = await blockImage(3, 640, 480);
    await expectCode(prepareUploadImage(await img.clone().avif().toBuffer(), { userId: "user-1" }), "file_type_not_allowed");
    await expectCode(prepareUploadImage(await img.clone().gif().toBuffer(), { userId: "user-1" }), "file_type_not_allowed");
    expect(rateLimit.calls).toEqual([]);
  });
});

describe("checkPdf", () => {
  const pdf = (body: string) => Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, "latin1");

  it("accepts a plain PDF", () => {
    expect(() => checkPdf(pdf("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj"))).not.toThrow();
  });

  it("refuses files that are not PDFs", () => {
    expect(() => checkPdf(Buffer.from("MZ\x90\x00 not a pdf"))).toThrow(expect.objectContaining({ code: "file_type_not_allowed" }));
  });

  it("refuses active content, also when obfuscated or compressed", () => {
    for (const body of [
      "1 0 obj << /Type /Catalog /OpenAction 3 0 R >> endobj",
      "3 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj",
      "3 0 obj << /S /Launch /F (cmd.exe) >> endobj",
      "4 0 obj << /Type /EmbeddedFile >> endobj",
      "3 0 obj << /S /J#61vaScript >> endobj",
    ]) {
      expect(() => checkPdf(pdf(body)), body).toThrow(expect.objectContaining({ code: "file_rejected" }));
    }

    const hidden = deflateSync(Buffer.from("<< /S /JavaScript /JS (app.alert(1)) >>"));
    const withStream = Buffer.concat([
      Buffer.from("%PDF-1.7\n5 0 obj << /Type /ObjStm /Filter /FlateDecode /Length 40 >>\nstream\n", "latin1"),
      hidden,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    expect(() => checkPdf(withStream)).toThrow(expect.objectContaining({ code: "file_rejected" }));
  });

  it("refuses PDFs over the size limit", () => {
    expect(() => checkPdf(pdf("x".repeat(2000)), 1000)).toThrow(expect.objectContaining({ code: "file_too_large" }));
  });
});
