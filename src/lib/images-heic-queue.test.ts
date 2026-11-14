import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * SECURITY_REPORT 9.a (founder's answer (e)): HEIC decoding costs CPU and memory, so one server
 * decodes one HEIC at a time and refuses new ones ("rate_limited") when three already wait. The
 * decoder is replaced by a slow fake that counts how many decodes run at once.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: async () => ({ ok: true, remaining: 1, resetAt: new Date() }) }));

const probe = vi.hoisted(() => ({ running: 0, maxRunning: 0, decodes: 0 }));
vi.mock("heic-decode", () => {
  const width = 480;
  const height = 400;
  const all = async () =>
    Object.assign(
      [
        {
          width,
          height,
          decode: async () => {
            probe.running++;
            probe.decodes++;
            probe.maxRunning = Math.max(probe.maxRunning, probe.running);
            await new Promise((resolve) => setTimeout(resolve, 40));
            probe.running--;
            return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(200) };
          },
        },
      ],
      { dispose: () => {} },
    );
  return { default: { all }, all };
});

const { prepareUploadImage } = await import("./images");
const HEIC = readFileSync(path.join(__dirname, "../../tests/fixtures/heic/gps-photo.heic"));

describe("HEIC decodes on one server", () => {
  it("run one at a time, and at most three more wait (the rest are refused, not queued)", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => prepareUploadImage(HEIC, { userId: `user-${i}` })));
    expect(probe.maxRunning).toBe(1);
    const done = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(done).toHaveLength(4);
    expect(refused).toHaveLength(2);
    for (const r of refused) expect(r.reason).toMatchObject({ code: "rate_limited", status: 429 });
    expect(probe.decodes).toBe(4);

    // The queue is free again afterwards.
    await expect(prepareUploadImage(HEIC, { userId: "user-late" })).resolves.toMatchObject({ source: "heic" });
    expect(probe.maxRunning).toBe(1);
  });
});
