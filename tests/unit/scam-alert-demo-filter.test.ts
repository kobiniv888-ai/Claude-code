/**
 * seed-demo-into-prod (3): the public scam alerts (/safety and the site-wide banner) show the
 * seeded demo alert, or any "Demo:" alert, only while "Show demo data" is on; the photo credits
 * mention the demo listing photos only then. Pure filter + the server loaders with a stand-in db.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  demoDataVisible: false,
  alerts: [] as { id: string; title: unknown; severity: string }[],
  photoCount: 7,
  photoCounted: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ demoDataVisible: state.demoDataVisible }),
  clearSettingsCache: () => undefined,
}));
vi.mock("@/lib/db", () => ({
  db: {
    scamAlert: { findMany: async () => state.alerts },
    listingPhoto: {
      count: async () => {
        state.photoCounted += 1;
        return state.photoCount;
      },
    },
  },
}));

const { DEMO_SCAM_ALERT_ID, isDemoScamAlert, visibleDemoListingPhotoCount, withoutHiddenDemoAlerts } = await import("@/lib/demo");
const { getActiveScamAlerts, getBannerScamAlert } = await import("@/lib/scam-alerts/server");

const real = { id: "real-1", title: { he: "פיקדון לפני צפייה", en: "Deposit before viewing" }, severity: "CRITICAL" };
const seeded = { id: DEMO_SCAM_ALERT_ID, title: { he: "x", en: "y" }, severity: "CRITICAL" };
const titled = { id: "admin-made", title: { en: "Demo: practice alert", he: "דוגמה" }, severity: "WARNING" };

beforeEach(() => {
  state.demoDataVisible = false;
  state.alerts = [];
  state.photoCounted = 0;
});

describe("the demo scam alert filter", () => {
  it("recognises the seeded alert and any 'Demo:' title", () => {
    expect(isDemoScamAlert(seeded)).toBe(true);
    expect(isDemoScamAlert(titled)).toBe(true);
    expect(isDemoScamAlert(real)).toBe(false);
  });

  it("hides demo alerts while demo data is hidden, keeps them while it is shown", () => {
    expect(withoutHiddenDemoAlerts([seeded, real, titled], false)).toEqual([real]);
    expect(withoutHiddenDemoAlerts([seeded, real, titled], true)).toEqual([seeded, real, titled]);
  });

  it("the /safety list and the banner apply it", async () => {
    state.alerts = [seeded, titled, real];
    expect((await getActiveScamAlerts()).map((a) => a.id)).toEqual(["real-1"]);
    expect((await getBannerScamAlert())?.id).toBe("real-1");
    state.alerts = [seeded];
    expect(await getBannerScamAlert()).toBeNull();
    state.demoDataVisible = true;
    expect((await getBannerScamAlert())?.id).toBe(DEMO_SCAM_ALERT_ID);
  });
});

describe("the photo-credits demo note", () => {
  it("counts demo photos only while demo data is shown", async () => {
    expect(await visibleDemoListingPhotoCount()).toBe(0);
    expect(state.photoCounted).toBe(0);
    state.demoDataVisible = true;
    expect(await visibleDemoListingPhotoCount()).toBe(7);
  });
});
