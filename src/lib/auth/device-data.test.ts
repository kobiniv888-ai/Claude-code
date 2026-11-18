import { describe, expect, it } from "vitest";
import { clearPrivateData, LOGGED_OUT_FLAG, privateStorageKeys } from "./device-data";

/** A minimal in-memory Storage. */
function memoryStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (key: string) => void map.delete(key),
    keys: () => [...map.keys()].sort(),
  };
}

describe("logout clears private device data (bug 2.9)", () => {
  it("picks recently viewed, compare, last search, saved lists and remembered phone countries", () => {
    expect(
      privateStorageKeys([
        "bayit:recently-viewed",
        "bayit:compare",
        "bayit:last-search",
        "bayit:saved-lists",
        "bayit:phone-country:login",
        "bayit:phone-country:listing-contact",
        "bayit:private:anything",
      ]),
    ).toHaveLength(7);
  });

  it("keeps theme, language, cookie consent, dismissed alerts and the safety-tip hint", () => {
    expect(
      privateStorageKeys(["theme", "bayit:consent", "bayit:dismissed-alerts", "bayit:demo-banner", "bayit:safety-tip-seen", "NEXT_LOCALE"]),
    ).toEqual([]);
  });

  it("clearPrivateData removes only the private keys", () => {
    const storage = memoryStorage({
      theme: "dark",
      "bayit:consent": "{}",
      "bayit:recently-viewed": "[1,2]",
      "bayit:compare": "[3]",
      "bayit:phone-country:login": "IL",
    });
    expect(clearPrivateData(storage)).toBe(3);
    expect(storage.keys()).toEqual(["bayit:consent", "theme"]);
  });

  it("never throws when storage is missing or blocked", () => {
    expect(clearPrivateData(null)).toBe(0);
    const blocked = {
      get length(): number {
        throw new Error("SecurityError");
      },
      key: () => null,
      removeItem: () => undefined,
    };
    expect(clearPrivateData(blocked)).toBe(0);
    expect(LOGGED_OUT_FLAG).toBe("bayit:logged-out");
  });
});
