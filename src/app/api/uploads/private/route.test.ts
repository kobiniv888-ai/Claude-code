/**
 * POST /api/uploads/private: an account over its upload limit is refused before its body is read
 * (no buffering of up to 15 MB per refused request), and `?purpose=report` caps the body at the
 * 5 MB screenshot limit before reading it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ limited: false, limitChecks: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUserForAction: async () => ({ id: "user-1" }) }));
vi.mock("@/lib/rate-limit", async () => {
  const { RateLimitError } = await import("@/lib/errors");
  return {
    assertRateLimit: async () => {
      state.limitChecks++;
      if (state.limited) throw new RateLimitError(new Date(Date.now() + 60_000));
      return { ok: true, remaining: 1, resetAt: new Date() };
    },
  };
});
vi.mock("@/lib/db", () => ({ db: { privateUpload: { create: async () => ({}) } } }));
vi.mock("@/lib/storage", () => ({ putPrivate: async () => undefined }));
vi.mock("@/lib/settings", () => ({ assertNotShabbatMode: async () => undefined }));
vi.mock("@/lib/images", () => ({
  IMAGE_MIME_TYPES: {},
  checkPdf: () => undefined,
  scanFile: async () => undefined,
  validateImage: async () => ({ format: "png" }),
  processPrivateImage: async () => ({ body: Buffer.from("x"), contentType: "image/jpeg" }),
}));

const { POST } = await import("./route");

/** A multipart request whose body records whether anything read it. */
function streamingRequest(url: string, headers: Record<string, string> = {}) {
  const read = { pulled: false };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        read.pulled = true;
        controller.error(new Error("the body must not be read"));
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(url, {
    method: "POST",
    body,
    headers: { "content-type": "multipart/form-data; boundary=x", ...headers },
    duplex: "half",
  } as RequestInit);
  return { request, read };
}

describe("POST /api/uploads/private", () => {
  beforeEach(() => {
    state.limited = false;
    state.limitChecks = 0;
  });

  it("answers 429 over the limit without reading the body", async () => {
    state.limited = true;
    const { request, read } = streamingRequest("http://localhost/api/uploads/private");
    const res = await POST(request);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(read.pulled).toBe(false);
  });

  it("refuses a report upload announcing more than 5 MB before reading it", async () => {
    const { request, read } = streamingRequest("http://localhost/api/uploads/private?purpose=report", {
      "content-length": String(6 * 1024 * 1024),
    });
    const res = await POST(request);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "file_too_large" });
    expect(read.pulled).toBe(false);
    expect(state.limitChecks).toBe(1);
  });

  it("refuses an address purpose that disagrees with the form", async () => {
    const form = new FormData();
    form.set("purpose", "ticket");
    form.set("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost/api/uploads/private?purpose=report", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_input" });
  });

  it("stores a report screenshot sent with the purpose in the address and the form", async () => {
    const form = new FormData();
    form.set("purpose", "report");
    form.set("file", new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost/api/uploads/private?purpose=report", { method: "POST", body: form }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ key: expect.stringMatching(/^private\/report\/user-1\/.+\.jpg$/), mime: "image/jpeg", name: "shot.jpg" });
  });

  it("refuses an unknown address purpose", async () => {
    const { request, read } = streamingRequest("http://localhost/api/uploads/private?purpose=avatar");
    expect((await POST(request)).status).toBe(400);
    expect(read.pulled).toBe(false);
  });
});
