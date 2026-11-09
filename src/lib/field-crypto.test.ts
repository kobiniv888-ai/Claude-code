/**
 * The server's field-encryption module (SECURITY_REPORT 12.3.c, D7): writes never fall back to
 * plain text, reads fail closed (nothing partial, a security event, no throw) and decrypted values
 * are tainted. Fake keys and values only; the security event log is mocked.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recorded: { type: string; meta?: Record<string, unknown> | null }[] = [];
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: vi.fn(async (input: { type: string; meta?: Record<string, unknown> | null }) => {
    recorded.push(input);
    return true;
  }),
}));

const fc = await import("./field-crypto");
const taint = await import("@/lib/security/taint");

const saved = { ...process.env };
function useEnv(env: Record<string, string | undefined>) {
  for (const name of ["FIELD_ENCRYPTION_KEY", "FIELD_ENCRYPTION_KEY_PREVIOUS", "SITE_ENV"]) delete process.env[name];
  Object.assign(process.env, env);
  fc.resetFieldKeyringForTests();
  fc.resetFieldEventsForTests();
}

beforeEach(() => {
  recorded.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...saved };
  fc.resetFieldKeyringForTests();
  taint.setTaintApiForTests(null);
  vi.restoreAllMocks();
});

describe("writing", () => {
  it("seals address, pin and phone; empty values stay empty", () => {
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    expect(fc.sealAddress("  12 Fake Street  ")).toMatch(/^fe1:/);
    expect(fc.sealAddress("   ")).toBeNull();
    expect(fc.sealAddress(null)).toBeNull();
    expect(fc.sealPin({ lat: 41.7, lng: 44.8 })).toMatch(/^fe1:/);
    expect(fc.sealPin(null)).toBeNull();
    const phone = fc.sealGuestPhone("+995555000123");
    expect(phone.guestPhoneEnc).toMatch(/^fe1:/);
    expect(phone.guestPhoneLookup).toMatch(/^fl1:/);
    expect(fc.guestPhoneLookups(["+995555000123", "+995555000123 "])).toEqual([phone.guestPhoneLookup]);
  });

  it("no key on a real site: refuses to write (never plain text instead)", () => {
    useEnv({ SITE_ENV: "production" });
    expect(() => fc.sealAddress("12 Fake Street")).toThrow(/FIELD_ENCRYPTION_KEY is not set/);
    expect(() => fc.sealGuestPhone("+995555000123")).toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  it("a development site without a key uses the development key, with a warning", () => {
    useEnv({ SITE_ENV: "development", BETTER_AUTH_SECRET: "fake-development-secret-0123456789" });
    expect(fc.fieldKeyring().current.source).toBe("development");
    expect(fc.openListingLocation({ addressEnc: fc.sealAddress("Dev Street 1") }, "test").address).toBe("Dev Street 1");
  });
});

describe("reading fails closed", () => {
  it("opens what it sealed, as one location", () => {
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    const location = fc.openListingLocation({ addressEnc: fc.sealAddress("12 Fake Street"), pinEnc: fc.sealPin({ lat: 41.71, lng: 44.82 }) }, "test");
    expect(location).toEqual({ address: "12 Fake Street", pin: { lat: 41.71, lng: 44.82 }, failed: false });
    expect(fc.openListingLocation({ addressEnc: null, pinEnc: null }, "test")).toEqual({ address: null, pin: null, failed: false });
    expect(recorded).toHaveLength(0);
  });

  it("wrong key: nothing shown (not even the half that opens), one security event, no throw", () => {
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    const addressEnc = fc.sealAddress("12 Fake Street");
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    const pinEnc = fc.sealPin({ lat: 41.71, lng: 44.82 });
    const location = fc.openListingLocation({ addressEnc, pinEnc }, "trip_page");
    expect(location).toEqual({ address: null, pin: null, failed: true });
    expect(recorded).toEqual([{ type: "field_decrypt_failed", ip: null, meta: { field: "listing.address", reason: "unknown_key", where: "trip_page" } }]);
    // Once a minute per field, reason and place: a page of 50 rows writes one event.
    fc.openListingLocation({ addressEnc, pinEnc }, "trip_page");
    expect(recorded).toHaveLength(1);
  });

  it("changed ciphertext or plain text in an encrypted column: not shown, event", () => {
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    const sealed = fc.sealGuestPhone("+995555000123").guestPhoneEnc;
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith("AA") ? "BB" : "AA"}`;
    expect(fc.openGuestPhone(tampered, "host_booking")).toEqual({ value: null, failed: true });
    expect(fc.openGuestPhone("+995555000123", "host_booking")).toEqual({ value: null, failed: true });
    expect(recorded.map((e) => e.meta?.reason)).toEqual(["tampered", "malformed"]);
    expect(JSON.stringify(recorded)).not.toContain("555000123");
  });

  it("no key at all: every read is 'not available', never a crash", () => {
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    const pinEnc = fc.sealPin({ lat: 41.71, lng: 44.82 });
    useEnv({ SITE_ENV: "production" });
    expect(fc.openPin(pinEnc, "nearby")).toEqual({ value: null, failed: true });
    expect(recorded[0]?.meta).toEqual({ field: "listing.pin", reason: "no_key", where: "nearby" });
  });

  it("rotation: values sealed with the previous key still open", () => {
    const oldKey = randomBytes(32).toString("base64");
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: oldKey });
    const phone = fc.sealGuestPhone("+972500000001");
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"), FIELD_ENCRYPTION_KEY_PREVIOUS: oldKey });
    expect(fc.openGuestPhone(phone.guestPhoneEnc, "test").value).toBe("+972500000001");
    expect(fc.guestPhoneLookups(["+972500000001"])).toContain(phone.guestPhoneLookup);
  });

  it("the opened location is tainted by reference (only a DTO may reach a page)", () => {
    const tainted: object[] = [];
    taint.setTaintApiForTests({
      experimental_taintObjectReference: (_message, object) => void tainted.push(object),
      experimental_taintUniqueValue: () => undefined,
    });
    useEnv({ SITE_ENV: "production", FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    const location = fc.openListingLocation({ addressEnc: fc.sealAddress("12 Fake Street") }, "test");
    expect(tainted).toContain(location);
  });
});
