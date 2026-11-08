/**
 * SECURITY_REPORT sections 9 and 10 on the running build (the gate runs it):
 * - 9.m: the first-listing review shows a "search this photo online" link per photo (Google Lens
 *   and TinEye, new tab, rel noopener noreferrer, the photo's own address only);
 * - 9.a: an iPhone HEIC photo is refused with its own message; AVIF and SVG are refused;
 * - 10.2 / 10.3.d: every page sends COOP same-origin, the enforced nonce CSP with base-uri 'none'
 *   and the stricter policy as Report-Only; /api/csp-report takes a browser report.
 * The unit tests hold the details (src/lib/media.test.ts, src/app/api/uploads/listing-photo/route.test.ts,
 * src/lib/security/csp.test.ts, tests/unit/security-headers-proxy.test.ts).
 */
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

test("HEIC, AVIF and SVG photos are refused by the server (9.a)", async ({ browser }) => {
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
  const report = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({ "csp-report": { "document-uri": "http://localhost/he", "effective-directive": "img-src", "blocked-uri": "https://e2e-csp.example/x.png", disposition: "report" } }),
  });
  expect(report.status()).toBe(204);
  await sql(`DELETE FROM "SecurityEvent" WHERE type = 'csp_report' AND meta->>'blocked' = 'https://e2e-csp.example'`);
});
