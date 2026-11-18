/**
 * POST /api/uploads/listing-photo with the REAL image checks (SECURITY_REPORT 9.a / 9.b): only
 * JPEG, PNG and WebP pass, judged from the file's first bytes, never from its name or declared
 * type. HEIC gets its own code (the message tells iPhone users how to send JPEG); AVIF, GIF and
 * SVG are refused like any other type. Session, database and storage are stubbed; sharp is real.
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ stored: [] as string[], created: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUserForAction: async () => ({ id: "user-1" }) }));
vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: async () => ({ ok: true, remaining: 1, resetAt: new Date() }) }));
vi.mock("@/lib/settings", () => ({ assertNotShabbatMode: async () => undefined }));
vi.mock("@/lib/risk", () => ({ isPhotoOfOtherAccount: async () => false }));
vi.mock("@/lib/listing/lifecycle", () => ({ submitForPublication: async () => undefined }));
vi.mock("@/lib/storage", () => ({
  putPublic: async (key: string) => {
    state.stored.push(key);
    return { url: `/api/media/${key}` };
  },
  deletePublic: async () => undefined,
}));
vi.mock("@/lib/db", () => {
  const tx = {
    $executeRaw: async () => 0,
    listingPhoto: {
      aggregate: async () => ({ _max: { sortOrder: null }, _count: 0 }),
      count: async () => 0,
      create: async () => {
        state.created++;
        return { id: "photo-1", isCover: true };
      },
    },
  };
  return {
    db: {
      listing: { findFirst: async () => ({ id: "listing-1", status: "DRAFT", _count: { photos: 0 } }) },
      roomType: { findFirst: async () => null },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

const { POST } = await import("./route");

function upload(bytes: Buffer, name: string, type: string) {
  const form = new FormData();
  form.set("listingId", "listing-1");
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return POST(new Request("http://localhost/api/uploads/listing-photo", { method: "POST", body: form, headers: { "sec-fetch-site": "same-origin" } }));
}

const photo = () =>
  sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 30, g: 90, b: 160 } } }).composite([
    { input: Buffer.from('<svg width="900" height="700"><rect x="100" y="100" width="300" height="200" fill="#c2603c"/></svg>'), top: 0, left: 0 },
  ]);

/** The start of an iPhone HEIC file (ISO-BMFF "ftyp" box, brand "heic"): libvips never sees it. */
function heicHeader(): Buffer {
  const box = Buffer.alloc(24);
  box.writeUInt32BE(24, 0);
  box.write("ftypheic", 4, "latin1");
  box.writeUInt32BE(0, 12);
  box.write("mif1heic", 16, "latin1");
  return Buffer.concat([box, Buffer.alloc(4000, 7)]);
}

describe("POST /api/uploads/listing-photo: accepted formats (SECURITY_REPORT 9.a)", () => {
  beforeEach(() => {
    state.stored = [];
    state.created = 0;
  });

  it.each([
    ["jpeg", "photo.jpg", "image/jpeg"],
    ["png", "photo.png", "image/png"],
    ["webp", "photo.webp", "image/webp"],
  ] as const)("accepts %s and stores only re-encoded WebP/JPEG files", async (format, name, type) => {
    const bytes = await photo().toFormat(format).toBuffer();
    const res = await upload(bytes, name, type);
    expect(res.status).toBe(201);
    expect(state.created).toBe(1);
    expect(state.stored.every((key) => /-(sm|md|lg)\.webp$|-og\.jpg$/.test(key))).toBe(true);
  });

  it("refuses an iPhone HEIC photo with the HEIC message, even named .jpg", async () => {
    for (const [name, type] of [
      ["IMG_0001.HEIC", "image/heic"],
      ["IMG_0001.jpg", "image/jpeg"],
    ]) {
      const res = await upload(heicHeader(), name, type);
      expect(res.status, name).toBe(415);
      expect(await res.json()).toEqual({ error: "heic_not_supported" });
    }
    expect(state.stored).toEqual([]);
  });

  it("refuses AVIF and GIF (WebP only, founder's answers Q2 and L7), even under a JPEG name", async () => {
    for (const format of ["avif", "gif"] as const) {
      const bytes = await photo().toFormat(format).toBuffer();
      const res = await upload(bytes, "photo.jpg", "image/jpeg");
      expect(res.status, format).toBe(415);
      expect(await res.json()).toEqual({ error: "file_type_not_allowed" });
    }
    expect(state.stored).toEqual([]);
  });

  it("refuses SVG and HTML whatever they are called", async () => {
    for (const [body, name] of [
      ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><script>alert(1)</script></svg>', "photo.jpg"],
      ["<!doctype html><script>alert(1)</script>", "photo.png"],
    ]) {
      const res = await upload(Buffer.from(body), name, "image/jpeg");
      expect(res.status, name).toBe(415);
      expect(await res.json()).toEqual({ error: "file_type_not_allowed" });
    }
    expect(state.stored).toEqual([]);
  });
});
