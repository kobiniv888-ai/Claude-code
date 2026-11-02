import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const findMany = vi.fn();
const upsert = vi.fn((args: unknown) => args);
const transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock("@/lib/db", () => ({
  db: { siteSetting: { findMany, upsert }, $transaction: transaction },
}));
const audit = vi.fn(async () => {});
vi.mock("@/lib/audit", () => ({ audit }));

const { DEFAULT_SETTINGS, HOME_SECTION_KEYS, getSettings, isShabbatModeActive, mergeSettings, updateSettings } =
  await import("./settings");
const { ShabbatModeError, ValidationError } = await import("./errors");

describe("mergeSettings", () => {
  it("returns the defaults without rows", () => {
    expect(mergeSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.shabbatModeEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.demoDataVisible).toBe(true);
    expect(DEFAULT_SETTINGS.listingExpiryDays).toBe(60);
    expect(DEFAULT_SETTINGS.paidFeaturePrices.bump).toBe(3);
  });

  it("merges valid rows and ignores invalid or unknown ones", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const settings = mergeSettings([
      { key: "listingExpiryDays", value: 90 },
      { key: "defaultCurrency", value: "GBP" }, // not enabled
      { key: "reportsToAutoHide", value: "lots" },
      { key: "somethingElse", value: true },
      { key: "paidFeaturePrices", value: { bump: 5 } },
    ]);
    expect(settings.listingExpiryDays).toBe(90);
    expect(settings.defaultCurrency).toBe(DEFAULT_SETTINGS.defaultCurrency);
    expect(settings.reportsToAutoHide).toBe(DEFAULT_SETTINGS.reportsToAutoHide);
    expect(settings.paidFeaturePrices).toEqual({ ...DEFAULT_SETTINGS.paidFeaturePrices, bump: 5 });
    spy.mockRestore();
  });

  it("keeps the saved section order and adds new sections at the end", () => {
    const settings = mergeSettings([
      { key: "homeSections", value: [{ key: "featured", enabled: false }, { key: "cities", enabled: true }] },
    ]);
    expect(settings.homeSections.slice(0, 2)).toEqual([
      { key: "featured", enabled: false },
      { key: "cities", enabled: true },
    ]);
    expect(settings.homeSections.map((s) => s.key).sort()).toEqual([...HOME_SECTION_KEYS].sort());
  });

  it("migrates round-1 home section keys instead of dropping the saved list", () => {
    const settings = mergeSettings([
      {
        key: "homeSections",
        value: [
          { key: "cities", enabled: true },
          { key: "shabbatTimes", enabled: false },
          { key: "newest", enabled: true },
          { key: "whyUs", enabled: true },
          { key: "safetyStrip", enabled: false },
          { key: "featured", enabled: true },
          { key: "constructor", enabled: true },
        ],
      },
    ]);
    expect(settings.homeSections.slice(0, 3)).toEqual([
      { key: "cities", enabled: true },
      { key: "jewishLife", enabled: false },
      { key: "featured", enabled: true },
    ]);
    expect(settings.homeSections.map((s) => s.key).sort()).toEqual([...HOME_SECTION_KEYS].sort());
  });
});

describe("getSettings", () => {
  it("falls back to defaults when the database fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    findMany.mockRejectedValueOnce(new Error("connection refused"));
    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    spy.mockRestore();
  });
});

describe("updateSettings", () => {
  it("validates input", async () => {
    findMany.mockResolvedValue([]);
    await expect(updateSettings({ listingExpiryDays: 2 }, "admin")).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ notASetting: 1 }, "admin")).rejects.toBeInstanceOf(ValidationError);
  });

  it("writes only changed keys and audits them", async () => {
    findMany.mockResolvedValue([]);
    await updateSettings({ listingExpiryDays: 60, shabbatModeEnabled: true }, "admin-1");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({ where: { key: "shabbatModeEnabled" } });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", action: "settings.update", targetId: "shabbatModeEnabled" }),
    );
  });
});

describe("isShabbatModeActive", () => {
  it("is off when the setting is off, even on Shabbat", async () => {
    findMany.mockResolvedValue([]);
    await expect(isShabbatModeActive(new Date("2026-10-31T09:00:00Z"))).resolves.toEqual({ active: false, endsAt: null });
  });

  it("follows Shabbat in Israel when the setting is on", async () => {
    findMany.mockResolvedValue([{ key: "shabbatModeEnabled", value: true }]);
    const saturday = await isShabbatModeActive(new Date("2026-10-31T09:00:00Z"));
    expect(saturday.active).toBe(true);
    expect(saturday.endsAt).toBeInstanceOf(Date);
    expect((await isShabbatModeActive(new Date("2026-10-28T09:00:00Z"))).active).toBe(false);
  });

  it("ShabbatModeError carries the end time", () => {
    const endsAt = new Date();
    expect(new ShabbatModeError(endsAt)).toMatchObject({ code: "shabbat_mode", endsAt });
  });
});
