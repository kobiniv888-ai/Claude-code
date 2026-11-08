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

const { codeSendKeys, limitCodeSend, mailboxKey, refundCodeSend, refundConfirmedCodeSend, rememberCodeDevice } = await import("./login-rate-limit");
const { rateLimitIpBlock } = await import("@/lib/rate-limit");
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

  it("IP: 30 codes a day, whatever the numbers, addresses and devices", async () => {
    const ip = ipHash("ip30");
    const device = (i: number) => `vitest-${run}-ipdev-${i}`;
    for (let i = 0; i < 30; i++) {
      expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip, deviceHash: device(i), now: at(i) }), `code ${i + 1}`).toMatchObject({ ok: true });
    }
    expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip, deviceHash: device(31), now: at(31) })).toMatchObject({
      ok: false,
      reason: "daily_cap",
      scope: "ip",
    });
    expect(await send({ channel: "phone", target: fakePhone(), ipHash: ip, deviceHash: device(32), now: at(32) })).toMatchObject({ ok: false, scope: "ip" });
  });

  it("no device id (no cookie): one device counter per IP — the 11th code is refused as 'device'", async () => {
    const ip = ipHash("nodevice");
    for (let i = 0; i < 10; i++) {
      expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip, deviceHash: null, now: at(i) }), `code ${i + 1}`).toMatchObject({ ok: true });
    }
    expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip, deviceHash: null, now: at(11) })).toMatchObject({ ok: false, reason: "daily_cap", scope: "device" });
  });

  it("5 codes an hour per address; a refused request does not count", async () => {
    const target = fakeEmail();
    const base = { channel: "email" as const, target, ipHash: ipHash("hour"), deviceHash: `vitest-${run}-hour-dev` };
    // Each code right after the previous one's wait (60, 120, 300, 900 s).
    const times = [0, 120, 300, 900, 1800];
    for (const [i, t] of times.entries()) {
      expect(await send({ ...base, now: at(t) }), `code ${i + 1}`).toMatchObject({ ok: true });
      expect(await send({ ...base, now: at(t + 1) }), `wait ${i + 1}`).toMatchObject({ ok: false, reason: "wait", scope: "resend" });
    }
    const t = 2700;
    const sixth = await send({ ...base, now: at(t) });
    expect(sixth).toMatchObject({ ok: false, reason: "wait", scope: "hour" });
    expect(sixth.ok === false && sixth.retryAfterSeconds).toBe(3600 - t);
    expect(await send({ ...base, now: at(3600) })).toMatchObject({ ok: true });
  });

  it("Gmail dots and +tags are one inbox: they share the address's waits and cap", async () => {
    expect(mailboxKey("Jo.Hn+x@GoogleMail.com")).toBe("john@gmail.com");
    expect(mailboxKey("j.o.h.n@gmail.com")).toBe("john@gmail.com");
    expect(mailboxKey("dana+tag@example.com")).toBe("dana@example.com");
    expect(mailboxKey("da.na@example.com")).toBe("da.na@example.com");
    const inbox = `vitest${run}${n++}`;
    const base = { channel: "email" as const, ipHash: ipHash("gmail"), deviceHash: null };
    expect(await send({ ...base, target: `${inbox}@gmail.com`, now: at(0) })).toMatchObject({ ok: true });
    expect(await send({ ...base, target: `${inbox.slice(0, 3)}.${inbox.slice(3)}+promo@googlemail.com`, now: at(1) })).toMatchObject({ ok: false, reason: "wait" });
  });

  it("a device that entered a code for the address before keeps its own allowance when others use the address's up", async () => {
    const target = fakeEmail();
    const attacker = `vitest-${run}-dev-x`;
    const owner = `vitest-${run}-dev-y`;
    let t = 0;
    for (let i = 0; i < 10; i++) {
      expect(await send({ channel: "email", target, ipHash: ipHash(`att${i}`), deviceHash: attacker, now: at(t) })).toMatchObject({ ok: true });
      t += 900;
    }
    expect(await send({ channel: "email", target, ipHash: ipHash("att-x"), deviceHash: attacker, now: at(t) })).toMatchObject({ ok: false, scope: "email" });
    // A device without history is refused like the attacker...
    expect(await send({ channel: "email", target, ipHash: ipHash("other"), deviceHash: `vitest-${run}-dev-z`, now: at(t) })).toMatchObject({ ok: false, scope: "email" });
    // ...the owner's device (it entered a code for this address before) still gets one.
    await rememberCodeDevice({ channel: "email", target, deviceHash: owner }, at(0));
    const ownKeys = codeSendKeys({ channel: "email", target, ipHash: ipHash("own"), deviceHash: owner, knownDevice: true });
    for (const key of Object.values(ownKeys)) if (key) touched.add(key);
    expect(await send({ channel: "email", target, ipHash: ipHash("own"), deviceHash: owner, now: at(t) })).toMatchObject({ ok: true });
    await db.rateLimit.deleteMany({ where: { key: { startsWith: "auth:otp-known:" }, AND: [{ key: { endsWith: owner } }] } });
  });

  it("emailed security codes: 10 a day per address, whichever accounts send them (the 11th is refused)", async () => {
    const target = fakeEmail();
    let t = 0;
    for (let i = 0; i < 10; i++) {
      const account = { key: `auth:security-code:day:vitest-${run}-acct-${i % 2}`, cap: 10 };
      touched.add(account.key);
      expect(await send({ channel: "email", target, ipHash: ipHash(`sc${i}`), deviceHash: null, account, now: at(t) })).toMatchObject({ ok: true });
      t += 900;
    }
    const eleventh = await send({ channel: "email", target, ipHash: ipHash("sc10"), deviceHash: null, account: { key: `auth:security-code:day:vitest-${run}-acct-1`, cap: 10 }, now: at(t) });
    expect(eleventh).toMatchObject({ ok: false, scope: "email" });
  });

  it("an account's own daily cap of emailed codes holds across addresses", async () => {
    const account = { key: `auth:security-code:day:vitest-${run}-acct-cap`, cap: 3 };
    touched.add(account.key);
    for (let i = 0; i < 3; i++) {
      expect(await send({ channel: "email", target: fakeEmail(), ipHash: ipHash(`acap${i}`), deviceHash: null, account, now: at(i) })).toMatchObject({ ok: true });
    }
    expect(await send({ channel: "email", target: fakeEmail(), ipHash: ipHash("acap3"), deviceHash: null, account, now: at(4) })).toMatchObject({
      ok: false,
      scope: "account",
    });
  });

  it("codes that were entered give back their IP share: 40 confirmed codes from one IP pass, 31 unconfirmed do not", async () => {
    const ip = ipHash("confirmed");
    for (let i = 0; i < 40; i++) {
      const device = `vitest-${run}-cdev-${i}`;
      expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip, deviceHash: device, now: at(i) }), `code ${i + 1}`).toMatchObject({ ok: true });
      await refundConfirmedCodeSend({ ipHash: ip, deviceHash: device });
    }
    const ip2 = ipHash("unconfirmed");
    for (let i = 0; i < 30; i++) {
      expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip2, deviceHash: `vitest-${run}-udev-${i}`, now: at(i) })).toMatchObject({ ok: true });
    }
    expect(await send({ channel: "email", target: fakeEmail(), ipHash: ip2, deviceHash: `vitest-${run}-udev-31`, now: at(31) })).toMatchObject({ ok: false, scope: "ip" });
  });

  it("a code that could not be sent gives its counts back (an immediate retry is allowed)", async () => {
    const target = fakePhone();
    const base = { channel: "phone" as const, target, ipHash: ipHash("refund"), deviceHash: null };
    expect(await send({ ...base, now: at(0) })).toMatchObject({ ok: true });
    await refundCodeSend(base, at(1));
    const keys = codeSendKeys(base);
    expect((await db.rateLimit.findUnique({ where: { key: keys.targetDay } }))?.count).toBe(0);
    expect(await send({ ...base, now: at(2) })).toMatchObject({ ok: true, nextSendInSeconds: 60 });
  });

  it("IPv6: one /64 is one IP for the limits (rateLimitIpBlock)", () => {
    expect(rateLimitIpBlock("2001:db8:1:2:aaaa::1")).toBe(rateLimitIpBlock("2001:db8:1:2:bbbb:cccc:dddd:eeee"));
    expect(rateLimitIpBlock("2001:db8:1:2::1")).not.toBe(rateLimitIpBlock("2001:db8:1:3::1"));
    expect(rateLimitIpBlock("203.0.113.9")).toBe("203.0.113.9");
    expect(rateLimitIpBlock("203.0.113.10")).not.toBe(rateLimitIpBlock("203.0.113.9"));
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
