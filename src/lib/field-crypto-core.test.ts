/**
 * Field encryption (SECURITY_REPORT 12.3.c, D7): round trip, wrong key, changed ciphertext, a value
 * moved to another column, key rotation and the phone lookups. Fake keys and values only.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FieldCryptoError,
  buildFieldKeyring,
  decodePin,
  encodePin,
  fieldKeyIdOf,
  fieldLookup,
  fieldLookups,
  openField,
  parseFieldKey,
  sealField,
  sealedKeyId,
  sealedWithOldKey,
} from "./field-crypto-core";

const newKey = () => randomBytes(32).toString("base64");
const ringOf = (env: Record<string, string>, development = false) => buildFieldKeyring(env, { development });
const reasonOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof FieldCryptoError ? error.reason : `other: ${String(error)}`;
  }
  return "no error";
};

describe("seal and open", () => {
  const ring = ringOf({ FIELD_ENCRYPTION_KEY: newKey() });

  it("round trip: address, pin and phone", () => {
    const address = "רחוב הדוגמה 12, דירה 4 (fake)";
    const sealed = sealField(ring, "listing.address", address);
    expect(sealed).toMatch(/^fe1:[0-9a-f]{8}:[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("12");
    expect(openField(ring, "listing.address", sealed)).toBe(address);
    const pin = { lat: 41.715138, lng: 44.827096 };
    expect(decodePin(openField(ring, "listing.pin", sealField(ring, "listing.pin", encodePin(pin))))).toEqual(pin);
    expect(openField(ring, "booking.guestPhone", sealField(ring, "booking.guestPhone", "+995555000123"))).toBe("+995555000123");
  });

  it("a fresh IV every time: the same value never looks the same twice", () => {
    expect(sealField(ring, "booking.guestPhone", "+995555000123")).not.toBe(sealField(ring, "booking.guestPhone", "+995555000123"));
  });

  it("the key id names the key that sealed it", () => {
    expect(sealedKeyId(sealField(ring, "listing.address", "x"))).toBe(ring.current.id);
    expect(sealedKeyId("plain text")).toBeNull();
  });

  it("wrong key: refused (unknown key), never garbage", () => {
    const other = ringOf({ FIELD_ENCRYPTION_KEY: newKey() });
    expect(reasonOf(() => openField(other, "listing.address", sealField(ring, "listing.address", "secret street 1")))).toBe("unknown_key");
  });

  it("a key with the same id but other bytes (forged id): refused as tampered", () => {
    const sealed = sealField(ring, "listing.address", "secret street 1");
    const forged = { current: { ...ring.current, encKey: randomBytes(32) }, keys: [{ ...ring.current, encKey: randomBytes(32) }] };
    expect(reasonOf(() => openField(forged, "listing.address", sealed))).toBe("tampered");
  });

  it("changed ciphertext, tag or IV: refused (tampered)", () => {
    const sealed = sealField(ring, "listing.address", "secret street 1");
    const [format, id, body] = sealed.split(":");
    const bytes = Buffer.from(body!, "base64url");
    for (const index of [0, 13, bytes.length - 1]) {
      const changed = Buffer.from(bytes);
      changed[index] = changed[index]! ^ 0x01;
      expect(reasonOf(() => openField(ring, "listing.address", `${format}:${id}:${changed.toString("base64url")}`)), `byte ${index}`).toBe("tampered");
    }
    expect(reasonOf(() => openField(ring, "listing.address", `${format}:${id}:${bytes.subarray(0, 20).toString("base64url")}`))).toBe("malformed");
  });

  it("a value copied into another column does not open there (purpose is bound in)", () => {
    const phone = sealField(ring, "booking.guestPhone", "+995555000123");
    expect(reasonOf(() => openField(ring, "listing.address", phone))).toBe("tampered");
  });

  it("anything that is not a sealed value is refused (malformed): plain text never passes", () => {
    for (const value of ["12 Fake Street", "fe1:zzzz:abc", "fe2:0123abcd:AAAA", ""]) {
      expect(reasonOf(() => openField(ring, "listing.address", value)), value).toBe("malformed");
    }
  });
});

describe("keys and rotation", () => {
  it("parses only 32 bytes of standard base64", () => {
    expect(parseFieldKey(newKey())).toHaveLength(32);
    expect(parseFieldKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseFieldKey("not a key")).toBeNull();
    expect(parseFieldKey("")).toBeNull();
  });

  it("no key: refused outside development; malformed key: refused everywhere", () => {
    expect(reasonOf(() => ringOf({}))).toBe("no_key");
    expect(reasonOf(() => ringOf({ FIELD_ENCRYPTION_KEY: "short" }, true))).toBe("bad_key");
    expect(reasonOf(() => ringOf({ FIELD_ENCRYPTION_KEY: newKey(), FIELD_ENCRYPTION_KEY_PREVIOUS: "short" }))).toBe("bad_key");
  });

  it("development without a key: a key derived from BETTER_AUTH_SECRET (stable)", () => {
    const a = ringOf({ BETTER_AUTH_SECRET: "fake-dev-secret-1" }, true);
    const b = ringOf({ BETTER_AUTH_SECRET: "fake-dev-secret-1" }, true);
    expect(a.current.source).toBe("development");
    expect(a.current.id).toBe(b.current.id);
    expect(ringOf({ BETTER_AUTH_SECRET: "fake-dev-secret-2" }, true).current.id).not.toBe(a.current.id);
  });

  it("rotation: the new key seals, the previous key still opens, re-sealing moves values to the new key", () => {
    const oldKey = newKey();
    const before = ringOf({ FIELD_ENCRYPTION_KEY: oldKey });
    const sealedOld = sealField(before, "listing.address", "old street 9");
    const during = ringOf({ FIELD_ENCRYPTION_KEY: newKey(), FIELD_ENCRYPTION_KEY_PREVIOUS: oldKey });
    expect(during.current.id).not.toBe(before.current.id);
    expect(openField(during, "listing.address", sealedOld)).toBe("old street 9");
    expect(sealedWithOldKey(during, sealedOld)).toBe(true);
    const resealed = sealField(during, "listing.address", openField(during, "listing.address", sealedOld));
    expect(sealedWithOldKey(during, resealed)).toBe(false);
    // After the rotation (previous key removed): the re-sealed value opens, the old one does not.
    const after = { current: during.current, keys: [during.current] };
    expect(openField(after, "listing.address", resealed)).toBe("old street 9");
    expect(reasonOf(() => openField(after, "listing.address", sealedOld))).toBe("unknown_key");
  });

  it("a development site also opens values sealed with its development key after a real key is set", () => {
    const env = { BETTER_AUTH_SECRET: "fake-dev-secret-3" };
    const sealed = sealField(ringOf(env, true), "listing.address", "dev street 1");
    const later = ringOf({ ...env, FIELD_ENCRYPTION_KEY: newKey() }, true);
    expect(openField(later, "listing.address", sealed)).toBe("dev street 1");
    expect(sealedWithOldKey(later, sealed)).toBe(true);
    // Never on staging or production.
    expect(reasonOf(() => openField(ringOf({ ...env, FIELD_ENCRYPTION_KEY: newKey() }), "listing.address", sealed))).toBe("unknown_key");
  });

  it("key ids are stable and public (they reveal nothing usable)", () => {
    const key = parseFieldKey(newKey())!;
    expect(fieldKeyIdOf(key)).toMatch(/^[0-9a-f]{8}$/);
    expect(fieldKeyIdOf(key)).toBe(fieldKeyIdOf(Buffer.from(key)));
  });
});

describe("lookups (the per-phone booking cap)", () => {
  it("the same number gives the same lookup; another number or key another one", () => {
    const ring = ringOf({ FIELD_ENCRYPTION_KEY: newKey() });
    const a = fieldLookup(ring, "booking.guestPhone", "+995555000123");
    expect(a).toMatch(/^fl1:[0-9a-f]{8}:[A-Za-z0-9_-]{43}$/);
    expect(a).not.toContain("555000123");
    expect(fieldLookup(ring, "booking.guestPhone", "+995555000123")).toBe(a);
    expect(fieldLookup(ring, "booking.guestPhone", "+995555000124")).not.toBe(a);
    expect(fieldLookup(ringOf({ FIELD_ENCRYPTION_KEY: newKey() }), "booking.guestPhone", "+995555000123")).not.toBe(a);
  });

  it("during a rotation a number matches lookups stored under the previous key", () => {
    const oldKey = newKey();
    const stored = fieldLookup(ringOf({ FIELD_ENCRYPTION_KEY: oldKey }), "booking.guestPhone", "+972500000001");
    const during = ringOf({ FIELD_ENCRYPTION_KEY: newKey(), FIELD_ENCRYPTION_KEY_PREVIOUS: oldKey });
    expect(fieldLookups(during, "booking.guestPhone", "+972500000001")).toContain(stored);
    expect(fieldLookups(during, "booking.guestPhone", "+972500000001")[0]).toBe(fieldLookup(during, "booking.guestPhone", "+972500000001"));
  });
});

describe("pins", () => {
  it("6 decimals, both halves or nothing", () => {
    expect(encodePin({ lat: 41.7, lng: 44.8 })).toBe("41.700000,44.800000");
    expect(decodePin("41.700000,44.800000")).toEqual({ lat: 41.7, lng: 44.8 });
    expect(decodePin("-33.5,151.25")).toEqual({ lat: -33.5, lng: 151.25 });
    for (const bad of ["41.7", "41.7,", "x,y", "91,10", "10,181", "41.7,44.8,1"]) expect(reasonOf(() => decodePin(bad)), bad).toBe("bad_value");
    expect(reasonOf(() => encodePin({ lat: Number.NaN, lng: 1 }))).toBe("bad_value");
  });
});
