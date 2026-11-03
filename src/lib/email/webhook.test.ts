import { describe, expect, it } from "vitest";
import { parseResendEvent, signSvix, svixHeadersOf, verifySvixSignature } from "./webhook";

// A made-up signing secret in Svix's format (base64 after "whsec_").
const SECRET = `whsec_${Buffer.from("bayit-test-signing-secret-0123456789").toString("base64")}`;
const NOW = new Date("2026-11-03T12:00:00Z");
const TS = String(Math.floor(NOW.getTime() / 1000));
const BODY = JSON.stringify({
  type: "email.bounced",
  created_at: "2026-11-03T11:59:58.000Z",
  data: {
    email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
    to: ["Yossi@Example.com"],
    tags: { template: "booking_new_host", booking: "BT-7K3Q9" },
    bounce: { message: "Mailbox does not exist", type: "Permanent", subType: "General" },
  },
});

function headers(signature: string, id = "msg_1", timestamp = TS) {
  return { id, timestamp, signature };
}

describe("verifySvixSignature", () => {
  it("accepts Svix's signature", () => {
    const signature = signSvix(SECRET, "msg_1", TS, BODY);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signature), body: BODY, now: NOW })).toBe(true);
  });
  it("accepts one valid entry among several (secret rotation)", () => {
    const signature = `v1,${Buffer.from("x".repeat(32)).toString("base64")} ${signSvix(SECRET, "msg_1", TS, BODY)}`;
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signature), body: BODY, now: NOW })).toBe(true);
  });
  it("refuses a changed body, id or timestamp, another secret and other versions", () => {
    const signature = signSvix(SECRET, "msg_1", TS, BODY);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signature), body: `${BODY} `, now: NOW })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signature, "msg_2"), body: BODY, now: NOW })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signature, "msg_1", String(Number(TS) + 1)), body: BODY, now: NOW })).toBe(false);
    const other = `whsec_${Buffer.from("another-secret").toString("base64")}`;
    expect(verifySvixSignature({ secret: other, headers: headers(signature), body: BODY, now: NOW })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signature.replace("v1,", "v2,")), body: BODY, now: NOW })).toBe(false);
  });
  it("refuses old or future timestamps (replays) and missing parts", () => {
    const old = String(Number(TS) - 301);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signSvix(SECRET, "msg_1", old, BODY), "msg_1", old), body: BODY, now: NOW })).toBe(false);
    const future = String(Number(TS) + 301);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signSvix(SECRET, "msg_1", future, BODY), "msg_1", future), body: BODY, now: NOW })).toBe(false);
    const signature = signSvix(SECRET, "msg_1", TS, BODY);
    expect(verifySvixSignature({ secret: "", headers: headers(signature), body: BODY, now: NOW })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, headers: { id: null, timestamp: TS, signature }, body: BODY, now: NOW })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, headers: headers("garbage"), body: BODY, now: NOW })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, headers: headers(signature, "msg_1", "12abc"), body: BODY, now: NOW })).toBe(false);
  });
  it("reads the svix-* headers (and the webhook-* names)", () => {
    expect(svixHeadersOf(new Headers({ "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x" }))).toEqual({ id: "a", timestamp: "1", signature: "v1,x" });
    expect(svixHeadersOf(new Headers({ "webhook-id": "b" })).id).toBe("b");
  });
});

describe("parseResendEvent", () => {
  it("reads a bounce", () => {
    expect(parseResendEvent(BODY)).toEqual({
      kind: "bounced",
      emailId: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      to: ["yossi@example.com"],
      tags: { template: "booking_new_host", booking: "BT-7K3Q9" },
      detail: "Permanent · General · Mailbox does not exist",
      at: new Date("2026-11-03T11:59:58.000Z"),
    });
  });
  it("reads complaints and deliveries, and tags sent as a list", () => {
    const complained = parseResendEvent(JSON.stringify({ type: "email.complained", data: { email_id: "e1", to: "a@b.co", tags: [{ name: "booking", value: "BT-7K3Q9" }] } }));
    expect(complained).toMatchObject({ kind: "complained", to: ["a@b.co"], tags: { booking: "BT-7K3Q9" } });
    expect(parseResendEvent(JSON.stringify({ type: "email.delivered", data: { email_id: "e2", to: ["a@b.co"] } }))?.kind).toBe("delivered");
  });
  it("ignores other events and broken JSON", () => {
    expect(parseResendEvent(JSON.stringify({ type: "email.opened", data: {} }))).toBeNull();
    expect(parseResendEvent("{")).toBeNull();
    expect(parseResendEvent(JSON.stringify({ data: {} }))).toBeNull();
  });
});
