/**
 * The resend waits and daily caps, ENFORCED ON THE SERVER (SECURITY_REPORT 3.1.c, 3.1.f, 3.2.c;
 * founder's answer Q7). Runs against the local database (DATABASE_URL in .env); every row it
 * writes is under a unique hash and removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "vitest-ip-hash", getDeviceHash: async () => null }));

const { codeSendKeys, limitCodeSend } = await import("./login-rate-limit");
const { db } = await import("@/lib/db");

const run = randomUUID().replace(/-/g, "").slice(0, 12);
const ipHash = (name: string) => `vitest-${run}-${name}`;
const touched = new Set<string>();

/** Fake test numbers (+972 50 0xx xxxx) and @example.com addresses only. */
let n = 0;
const fakePhone = () => `+97250${String(Date.now() % 100000).padStart(5, "0")}${String(n++ % 100).padStart(2, "0")}`;
const fakeEmail = () => `vitest-${run}-${n++}@example.com`;

async function send(input: Parameters<typeof limitCodeSend>[0]) {
  const keys = codeSendKeys(input);
  for (const key of Object.values(keys)) if (key) touched.add(key);
  return limitCodeSend(input);
}

const T0 = new Date("2026-11-08T10:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

beforeAll(() => {
  touched.clear();
});

afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { key: { in: [...touched] } } });
  await db.$disconnect();
});

describe("limitCodeSend (Postgres, atomic)", () => {
  it("phone: 60 s after the first code, then 120 s, 300 s, 900 s; the 6th code of the day is refused", async () => {
    const target = fakePhone();
    const base = { channel: "phone" as const, target, ipHash: ipHash("p1"), deviceHash: null };
    expect(await send({ ...base, now: at(0) })).toMatchObject({ ok: true, nextSendInSeconds: 60 });
    // A second code within a second: refused by the server, with the wait.
    expect(await send({ ...base, now: at(1) })).toEqual({ ok: false, reason: "wait", scope: "resend", retryAfterSeconds: 59 });
    expect(await send({ ...base, now: at(60) })).toMatchObject({ ok: true, nextSendInSeconds: 120 });
    expect(await send({ ...base, now: at(179) })).toMatchObject({ ok: false, reason: "wait", retryAfterSeconds: 1 });
    expect(await send({ ...base, now: at(180) })).toMatchObject({ ok: true, nextSendInSeconds: 300 });
    expect(await send({ ...base, now: at(480) })).toMatchObject({ ok: true, nextSendInSeconds: 900 });
    expect(await send({ ...base, now: at(1380) })).toMatchObject({ ok: true, sendsLeftToday: 0 });
    const sixth = await send({ ...base, now: at(2280) });
    expect(sixth).toMatchObject({ ok: false, reason: "daily_cap", scope: "phone" });
    // …until 24 hours after the first code.
    expect(sixth.ok === false && sixth.retryAfterSeconds).toBe(24 * 3600 - 2280);
    expect(await send({ ...base, now: at(24 * 3600) })).toMatchObject({ ok: true, nextSendInSeconds: 60 });
  });

  it("email: 10 codes a day per address", async () => {
    const target = fakeEmail();
    const base = { channel: "email" as const, target, ipHash: ipHash("e1"), deviceHash: null };
    let t = 0;
    for (let i = 0; i < 10; i++) {
      expect(await send({ ...base, now: at(t) }), `code ${i + 1}`).toMatchObject({ ok: true });
      t += 900;
    }
    expect(await send({ ...base, now: at(t) })).toMatchObject({ ok: false, reason: "daily_cap", scope: "email" });
    // The address is the same whatever its case.
    expect(await send({ ...base, target: target.toUpperCase(), now: at(t) })).toMatchObject({ ok: false, scope: "email" });
  });

  it("IP: 30 codes a day, whatever the numbers and addresses", async () => {
    const ip = ipHash("ip30");
    for (let i = 0; i < 30; i++) {
      expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip, deviceHash: null, now: at(i) }), `code ${i + 1}`).toMatchObject({ ok: true });
    }
    expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip, deviceHash: null, now: at(31) })).toMatchObject({
      ok: false,
      reason: "daily_cap",
      scope: "ip",
    });
    expect(await send({ channel: "phone", target: fakePhone(), ipHash: ip, deviceHash: null, now: at(32) })).toMatchObject({ ok: false, scope: "ip" });
  });

  it("device: 10 codes a day per browser", async () => {
    const device = `vitest-${run}-device`;
    for (let i = 0; i < 10; i++) {
      const ok = await send({ channel: "email", target: fakeEmail(), ipHash: ipHash(`d${i}`), deviceHash: device, now: at(i) });
      expect(ok, `code ${i + 1}`).toMatchObject({ ok: true });
    }
    expect(await send({ channel: "email", target: fakeEmail(), ipHash: ipHash("d10"), deviceHash: device, now: at(11) })).toMatchObject({
      ok: false,
      scope: "device",
    });
  });

  it("is atomic: 10 parallel requests for one number send exactly one code", async () => {
    const target = fakePhone();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => send({ channel: "phone", target, ipHash: ipHash(`par${i}`), deviceHash: null, now: at(0) })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "wait")).toHaveLength(9);
  });

  it("stores no phone number or email address (only keyed hashes)", async () => {
    const target = fakePhone();
    await send({ channel: "phone", target, ipHash: ipHash("h"), deviceHash: null, now: at(0) });
    const keys = Object.values(codeSendKeys({ channel: "phone", target, ipHash: ipHash("h"), deviceHash: null })).filter(Boolean) as string[];
    for (const key of keys) {
      expect(key).not.toContain(target);
      expect(key).not.toContain(target.slice(1));
    }
  });

  it("fails closed when the store breaks", async () => {
    const spy = vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const result = await limitCodeSend({ channel: "phone", target: fakePhone(), ipHash: ipHash("broken"), deviceHash: null });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
    spy.mockRestore();
  });
});
