import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_CONSENT, CONSENT_EVENT, consentCookieString, NECESSARY_ONLY, type Consent } from "@/lib/consent-cookie";
import { createHistoryStore } from "./history-store";

/** A minimal browser: localStorage, document.cookie and window events. */
function fakeBrowser() {
  const map = new Map<string, string>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const g = globalThis as Record<string, unknown>;
  g.window = {
    localStorage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => listeners.get(type)?.delete(fn),
  };
  g.document = { cookie: "" };
  return {
    map,
    consent(consent: Consent | null) {
      (g.document as { cookie: string }).cookie = consent ? consentCookieString(consent, { secure: false }).split(";")[0] : "";
    },
    fire(type: string) {
      listeners.get(type)?.forEach((fn) => fn({}));
    },
  };
}

const store = () =>
  createHistoryStore<number[]>({
    key: "bayit:test-history",
    empty: [],
    parse: (value) => (Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : []),
    serialize: (value) => value,
    isEmpty: (value) => value.length === 0,
  });

describe("device history and cookie consent", () => {
  let browser: ReturnType<typeof fakeBrowser>;
  beforeEach(() => {
    browser = fakeBrowser();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  it("stores nothing before the visitor chose", () => {
    const s = store();
    s.write([1, 2]);
    expect(browser.map.size).toBe(0);
    expect(s.read()).toEqual([]);
  });

  it("stores nothing with 'necessary only'", () => {
    browser.consent(NECESSARY_ONLY);
    const s = store();
    s.write([1]);
    expect(browser.map.size).toBe(0);
  });

  it("stores and reads after 'accept all' (or preferences)", () => {
    browser.consent(ALL_CONSENT);
    const s = store();
    s.write([3, 4]);
    expect(browser.map.get("bayit:test-history")).toBe("[3,4]");
    expect(s.read()).toEqual([3, 4]);
    // A stable snapshot while nothing changes (useSyncExternalStore needs that).
    expect(s.read()).toBe(s.read());
    s.write([]);
    expect(browser.map.has("bayit:test-history")).toBe(false);
  });

  it("does not read what is stored without consent, and keeps it until the visitor chooses", () => {
    browser.map.set("bayit:test-history", "[9]");
    const s = store();
    expect(s.read()).toEqual([]);
    s.subscribe(() => undefined);
    expect(browser.map.get("bayit:test-history")).toBe("[9]");
  });

  it("removes what is stored when the visitor chooses 'necessary only'", () => {
    browser.consent(ALL_CONSENT);
    const s = store();
    s.write([5]);
    let calls = 0;
    s.subscribe(() => calls++);
    browser.consent(NECESSARY_ONLY);
    browser.fire(CONSENT_EVENT);
    expect(browser.map.has("bayit:test-history")).toBe(false);
    expect(s.read()).toEqual([]);
    expect(calls).toBe(1);
  });

  it("never throws when storage is blocked", () => {
    browser.consent(ALL_CONSENT);
    const win = (globalThis as { window: { localStorage: Record<string, unknown> } }).window;
    win.localStorage.getItem = () => {
      throw new Error("SecurityError");
    };
    win.localStorage.setItem = () => {
      throw new Error("SecurityError");
    };
    const s = store();
    expect(s.read()).toEqual([]);
    s.write([7]);
    expect(s.read()).toEqual([7]);
  });
});
