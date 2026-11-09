/**
 * SECURITY_REPORT sections 9 and 10 on the running build (the gate runs it):
 * - 9.m: the first-listing review shows a "search this photo online" link per photo (Google Lens
 *   and TinEye, new tab, rel noopener noreferrer, the photo's own address only);
 * - 9.a / 9.g (founder's answer (e)): a real iPhone-style HEIC photo with GPS, a camera model and
 *   XMP is converted on the server through the real upload route, and every stored copy is a
 *   WebP/JPEG with no metadata; a HEIC file we cannot decode gets its own message; AVIF and SVG
 *   are refused;
 * - 10.2 / 10.3.d: every page sends COOP same-origin, the enforced nonce CSP with base-uri 'none'
 *   and the stricter policy as Report-Only; /api/csp-report takes a browser report.
 * The unit tests hold the details (src/lib/media.test.ts, src/app/api/uploads/listing-photo/route.test.ts,
 * src/lib/security/csp.test.ts, tests/unit/security-headers-proxy.test.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { TEST_ADMIN_PHONE } from "./helpers/staff";
import { createTestListing, createTestUser, sql } from "./helpers/db";

test("the review screen links each photo to a reverse image search (9.m)", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Photo Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Reverse search ${Date.now().toString(36)}`, status: "IN_REVIEW" });
  const [{ count }] = await sql<{ count: number }>(`SELECT count(*)::int AS count FROM "ListingPhoto" WHERE "listingId" = $1`, [listing.id]);

  const { context, page, consoleErrors } = await openAs(browser, TEST_ADMIN_PHONE);
  await page.goto(`/en/admin/moderation/${listing.id}`);
  await settle(page);
  const rows = page.getByTestId("reverse-image-search");
  await expect(rows).toHaveCount(count);
  for (const [site, prefix] of [
    ["Google Lens", "https://lens.google.com/uploadbyurl?url="],
    ["TinEye", "https://tineye.com/search?url="],
  ] as const) {
    const link = rows.first().getByRole("link", { name: new RegExp(site) });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
    const href = (await link.getAttribute("href")) ?? "";
    expect(href.startsWith(prefix)).toBe(true);
    // Only the photo's own public address goes to the search site.
    expect(new URL(href).searchParams.get("url")).toMatch(/^https?:\/\/[^/]+\/(photos|api\/media)\//);
  }
  expect(consoleErrors).toEqual([]);
  await context.close();
});

/**
 * tests/fixtures/heic/gps-photo.heic: a made-up 480×400 HEIC with a GPS position, the camera
 * model "FixturePhone 15" and an XMP block naming exif:GPSLatitude (tests/fixtures/heic/make-gps-heic.mjs).
 */
const HEIC_FIXTURE = readFileSync(path.join(process.cwd(), "tests/fixtures/heic/gps-photo.heic"));
const HEIC_SECRETS = ["FixturePhone 15", "FixtureCam", "exif:GPSLatitude", "GPSLatitude"];

test("an iPhone HEIC photo with GPS is converted on the server and stored without metadata (9.a, 9.g)", async ({ browser }) => {
  // Positive control: the fixture really carries the HEIC brand, the camera and the GPS block.
  const raw = HEIC_FIXTURE.toString("latin1");
  expect(raw.slice(4, 12)).toBe("ftypheic");
  for (const secret of ["FixturePhone 15", "exif:GPSLatitude"]) expect(raw, secret).toContain(secret);

  const owner = await createTestUser({ name: "E2E HEIC Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E HEIC upload ${Date.now().toString(36)}`, status: "DRAFT", photos: 0 });
  const { context } = await openAsTestUser(browser, owner);
  // The browser sends it as Chrome on Windows would: a .HEIC file the page could not convert.
  const res = await context.request.post("/api/uploads/listing-photo", {
    multipart: { listingId: listing.id, file: { name: "IMG_4242.HEIC", mimeType: "image/heic", buffer: HEIC_FIXTURE } },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { id: string; url: string; width: number; height: number };
  expect([body.width, body.height]).toEqual([480, 400]);

  const [photo] = await sql<{ storageKey: string; url: string }>(`SELECT "storageKey", url FROM "ListingPhoto" WHERE id = $1 AND "listingId" = $2`, [body.id, listing.id]);
  expect(photo?.url).toBe(body.url);
  // Every stored copy: lg/md/sm WebP and the share-image JPEG.
  for (const [variant, format] of [["lg", "webp"], ["md", "webp"], ["sm", "webp"], ["og", "jpeg"]] as const) {
    const url = body.url.replace(/-lg\.webp(\?.*)?$/, variant === "og" ? "-og.jpg" : `-${variant}.webp`);
    const file = await context.request.get(url);
    expect(file.status(), url).toBe(200);
    const bytes = Buffer.from(await file.body());
    const meta = await sharp(bytes).metadata();
    expect(meta.format, variant).toBe(format);
    expect(meta.exif, `${variant} exif`).toBeUndefined();
    expect(meta.xmp, `${variant} xmp`).toBeUndefined();
    expect(meta.iptc, `${variant} iptc`).toBeUndefined();
    const text = bytes.toString("latin1");
    for (const secret of HEIC_SECRETS) expect(text.includes(secret), `${variant}: ${secret}`).toBe(false);
    expect(text.includes("Exif\0\0"), `${variant}: EXIF block`).toBe(false);
  }
  await context.close();
});

test("an undecodable HEIC, AVIF and SVG are refused by the server (9.a)", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Upload Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Upload formats ${Date.now().toString(36)}`, status: "DRAFT", photos: 0 });
  const { context } = await openAsTestUser(browser, owner);

  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic\0\0\0\0mif1heic", "latin1"), Buffer.alloc(2048, 7)]);
  // A 1×1 AVIF ("ftypavif" brand): refused from its first bytes before any decoder runs.
  const avif = Buffer.concat([Buffer.from([0, 0, 0, 28]), Buffer.from("ftypavif\0\0\0\0avifmif1miaf", "latin1"), Buffer.alloc(2048, 3)]);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><script>alert(1)</script></svg>');
  for (const [name, buffer, code] of [
    ["IMG_0001.HEIC", heic, "heic_not_supported"],
    ["photo.jpg", avif, "file_type_not_allowed"],
    ["photo.jpg", svg, "file_type_not_allowed"],
  ] as const) {
    const res = await context.request.post("/api/uploads/listing-photo", {
      multipart: { listingId: listing.id, file: { name, mimeType: "image/jpeg", buffer } },
    });
    expect(res.status(), name).toBe(415);
    expect(await res.json()).toEqual({ error: code });
  }
  const [{ count }] = await sql<{ count: number }>(`SELECT count(*)::int AS count FROM "ListingPhoto" WHERE "listingId" = $1`, [listing.id]);
  expect(count).toBe(0);
  await context.close();
});

test("pages send COOP same-origin and the CSP pair; the report endpoint answers (10.2, 10.3.d)", async ({ request }) => {
  for (const path of ["/he", "/en/search", "/he/login"]) {
    const res = await request.get(path);
    const headers = res.headers();
    expect(headers["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(headers["content-security-policy"], path).toContain("base-uri 'none'");
    expect(headers["content-security-policy"], path).toContain("object-src 'none'");
    expect(headers["content-security-policy"], path).not.toContain("unsafe-eval");
    const trial = headers["content-security-policy-report-only"] ?? "";
    expect(trial, path).toMatch(/img-src 'self' data: blob:/);
    expect(trial, path).not.toMatch(/img-src[^;]* https:(;| )/);
    expect(headers["reporting-endpoints"], path).toBe('csp-endpoint="/api/csp-report"');
  }
  // The browsers of earlier tests may have used this machine's per-IP allowance (5 a minute) or
  // already sent this kind of report this hour (written once an hour): start clean.
  await sql(`DELETE FROM "RateLimit" WHERE key LIKE 'csp-report%'`);
  const report = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({ "csp-report": { "document-uri": "http://localhost/he", "effective-directive": "img-src", "blocked-uri": "https://e2e-csp.example/x.png", disposition: "report" } }),
  });
  expect(report.status()).toBe(204);
  await sql(`DELETE FROM "SecurityEvent" WHERE type = 'csp_report' AND meta->>'blocked' = 'https://e2e-csp.example'`);
});
