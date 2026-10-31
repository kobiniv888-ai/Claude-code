import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), "bayit-storage-"));
process.env.STORAGE_LOCAL_DIR = root;
process.env.STORAGE_DRIVER = "local";
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const storage = await import("./index");
const { storageKeyProblem, publicContentTypeFor } = await import("./keys");
const { GET } = await import("../../app/api/media/[...key]/route");

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const params = (key: string) => ({ params: Promise.resolve({ key: key.split("/") }) });

describe("storage keys", () => {
  it("accepts normal keys", () => {
    expect(storageKeyProblem("listings/clx123/9f2c-01.webp")).toBeNull();
    expect(storage.storageKey("listings", "/clx123/", "a.webp")).toBe("listings/clx123/a.webp");
  });

  it("rejects traversal, absolute and odd keys", () => {
    for (const bad of ["", "/etc/passwd", "../secret", "a/../b", "a//b", "a/./b", "a/", ".env", "a/.hidden", "a\\b", "a b.webp", "ü.webp"]) {
      expect(storageKeyProblem(bad), bad).not.toBeNull();
    }
    expect(() => storage.storageKey("..", "x")).toThrow(storage.InvalidStorageKeyError);
  });

  it("maps image extensions to content types", () => {
    expect(publicContentTypeFor("a/b.webp")).toBe("image/webp");
    expect(publicContentTypeFor("a/b.JPG")).toBe("image/jpeg");
    expect(publicContentTypeFor("a/b.svg")).toBeNull();
    expect(publicContentTypeFor("a/b")).toBeNull();
  });
});

describe("public files (local driver)", () => {
  it("stores, serves and deletes a photo", async () => {
    const body = randomBytes(2048);
    const { key, url } = await storage.putPublic("listings/l1/photo.webp", body, "image/webp");
    expect(url).toBe("/api/media/listings/l1/photo.webp");
    expect(fs.readFileSync(path.join(root, "public", key)).equals(body)).toBe(true);

    const res = await GET(new Request("http://localhost" + url), params(key));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);

    await storage.deletePublic(key);
    expect((await GET(new Request("http://localhost" + url), params(key))).status).toBe(404);
    await expect(storage.deletePublic(key)).resolves.toBeUndefined();
  });

  it("refuses non-images and mismatched types", async () => {
    await expect(storage.putPublic("a/page.html", Buffer.from("<script>"), "text/html")).rejects.toThrow();
    await expect(storage.putPublic("a/photo.webp", Buffer.from("x"), "image/png")).rejects.toThrow();
  });

  it("the media route never serves private files or escapes the folder", async () => {
    await storage.putPrivate("verifications/r1/id.webp", Buffer.from("passport"), "image/webp");
    expect((await GET(new Request("http://localhost/"), params("verifications/r1/id.webp"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/"), params("../private/verifications/r1/id.webp"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/"), { params: Promise.resolve({ key: ["..", "..", "etc", "passwd"] }) })).status).toBe(404);
  });

  it("builds absolute URLs for emails and previews", () => {
    expect(storage.absolutePublicUrl("listings/l1/a.webp")).toMatch(/^https?:\/\/[^/]+\/api\/media\/listings\/l1\/a\.webp$/);
  });
});

describe("private files", () => {
  it("are encrypted at rest and decrypted on read", async () => {
    const body = Buffer.from("%PDF-1.7 NAPR extract — cadastral 01.10.13.010.001");
    await storage.putPrivate("verifications/r2/extract.pdf", body, "application/pdf");
    const raw = fs.readFileSync(path.join(root, "private", "verifications/r2/extract.pdf"));
    expect(raw.includes(Buffer.from("NAPR"))).toBe(false);
    expect(raw.includes(Buffer.from("application/pdf"))).toBe(false);

    const file = await storage.getPrivate("verifications/r2/extract.pdf");
    expect(file.contentType).toBe("application/pdf");
    expect(file.body.equals(body)).toBe(true);

    await storage.deletePrivate("verifications/r2/extract.pdf");
    await expect(storage.getPrivate("verifications/r2/extract.pdf")).rejects.toMatchObject({ code: "not_found" });
  });
});
