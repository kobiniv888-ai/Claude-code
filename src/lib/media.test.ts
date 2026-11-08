import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOwnPrivateUpload,
  listingPhotoVariantKeys,
  mediaBaseUrl,
  photoUrl,
  privateUploadPrefix,
  reverseImageSearchLinks,
  UPLOAD_IMAGE_ACCEPT,
} from "./media";

afterEach(() => vi.unstubAllEnvs());

describe("photoUrl", () => {
  const uploaded = { url: "/api/media/listings/l1/p1-lg.webp", storageKey: "listings/l1/p1" };

  it("points at the stored variant of an uploaded photo", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", "");
    expect(photoUrl(uploaded, "sm")).toBe("/api/media/listings/l1/p1-sm.webp");
    expect(photoUrl(uploaded, "md")).toBe("/api/media/listings/l1/p1-md.webp");
    expect(photoUrl(uploaded, "lg")).toBe("/api/media/listings/l1/p1-lg.webp");
    expect(photoUrl(uploaded, "og")).toBe("/api/media/listings/l1/p1-og.jpg");
  });

  it("uses NEXT_PUBLIC_MEDIA_BASE_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", "https://media.bayit.example");
    expect(mediaBaseUrl()).toBe("https://media.bayit.example/");
    expect(photoUrl(uploaded, "md")).toBe("https://media.bayit.example/listings/l1/p1-md.webp");
  });

  it("adds size parameters to Unsplash demo photos", () => {
    const demo = { url: "https://images.unsplash.com/photo-123?ixid=abc&w=3000&q=100", storageKey: null };
    const sm = new URL(photoUrl(demo, "sm"));
    expect(sm.searchParams.get("w")).toBe("400");
    expect(sm.searchParams.get("q")).toBe("75");
    expect(sm.searchParams.get("auto")).toBe("format");
    expect(sm.searchParams.get("fit")).toBe("crop");
    expect(sm.searchParams.get("ixid")).toBe("abc");
    expect(new URL(photoUrl(demo, "md")).searchParams.get("w")).toBe("800");
    expect(new URL(photoUrl(demo, "lg")).searchParams.get("w")).toBe("1600");
    const og = new URL(photoUrl(demo, "og"));
    expect([og.searchParams.get("w"), og.searchParams.get("h")]).toEqual(["1200", "630"]);
  });

  it("leaves other URLs alone", () => {
    expect(photoUrl({ url: "https://example.com/a.jpg" }, "sm")).toBe("https://example.com/a.jpg");
    expect(photoUrl({ url: "/static/a.jpg" }, "lg")).toBe("/static/a.jpg");
  });

  it("lists every stored file of a photo", () => {
    expect(listingPhotoVariantKeys("listings/l1/p1")).toEqual([
      "listings/l1/p1-sm.webp",
      "listings/l1/p1-md.webp",
      "listings/l1/p1-lg.webp",
      "listings/l1/p1-og.jpg",
    ]);
  });
});

describe("private uploads", () => {
  it("ties keys to the uploader and the purpose", () => {
    expect(privateUploadPrefix("verification", "u1")).toBe("private/verification/u1/");
    expect(isOwnPrivateUpload("private/verification/u1/abc_DEF-123.pdf", "u1", "verification")).toBe(true);
    expect(isOwnPrivateUpload("private/ticket/u1/abc.jpg", "u1", "ticket")).toBe(true);
    expect(isOwnPrivateUpload("private/verification/u2/abc.pdf", "u1", "verification")).toBe(false);
    expect(isOwnPrivateUpload("private/ticket/u1/abc.jpg", "u1", "verification")).toBe(false);
    expect(isOwnPrivateUpload("private/verification/u1/../u2/abc.pdf", "u1", "verification")).toBe(false);
    expect(isOwnPrivateUpload("private/verification/u1/sub/abc.pdf", "u1", "verification")).toBe(false);
    expect(isOwnPrivateUpload(42, "u1", "verification")).toBe(false);
  });
});

// SECURITY_REPORT 9.m: a reverse image search link per photo in the first-listing review.
describe("reverseImageSearchLinks", () => {
  it("links Google Lens and TinEye to the photo's public address (encoded, nothing uploaded)", () => {
    const photo = "https://media.bayit.example/listings/l1/p1-lg.webp?v=1&x=2";
    const links = reverseImageSearchLinks(photo)!;
    expect(links.googleLens).toBe(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(photo)}`);
    expect(links.tinEye).toBe(`https://tineye.com/search?url=${encodeURIComponent(photo)}`);
    // The photo address is one query value: it cannot add parameters of its own.
    expect(new URL(links.tinEye).searchParams.get("url")).toBe(photo);
    expect([...new URL(links.tinEye).searchParams.keys()]).toEqual(["url"]);
  });

  it("makes a local media path absolute on the site's address", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bayit.example");
    const links = reverseImageSearchLinks("/api/media/listings/l1/p1-lg.webp")!;
    expect(new URL(links.googleLens).searchParams.get("url")).toMatch(/^https?:\/\/[^/]+\/api\/media\/listings\/l1\/p1-lg\.webp$/);
  });

  it("gives no links for other schemes or addresses with credentials", () => {
    expect(reverseImageSearchLinks("javascript:alert(1)")).toBeNull();
    expect(reverseImageSearchLinks("data:image/png;base64,AAAA")).toBeNull();
    expect(reverseImageSearchLinks("https://user:pass@media.bayit.example/p.webp")).toBeNull();
  });
});

// SECURITY_REPORT 9.a: upload fields offer JPEG, PNG and WebP only (iPhones then send JPEG).
describe("UPLOAD_IMAGE_ACCEPT", () => {
  it("lists exactly JPEG, PNG and WebP", () => {
    expect(UPLOAD_IMAGE_ACCEPT.split(",").sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});
