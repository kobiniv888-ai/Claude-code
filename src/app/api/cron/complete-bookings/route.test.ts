/**
 * FC-5: the daily complete-bookings job runs the "host asked me to cancel" 72-hour timeout even
 * when completing finished bookings fails, and the hourly security-alerts job runs the timeout too.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ completeFails: false, alertsFail: false, expired: 0, alerts: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring", () => ({ reportError: async () => undefined }));
vi.mock("@/lib/security/server-errors", () => ({ recordServerError: async () => undefined }));
vi.mock("@/lib/booking/service", () => ({
  completeFinishedBookings: async () => {
    if (calls.completeFails) throw new Error("email provider down");
    return { completed: 2 };
  },
  expireHostAskedAnswers: async () => {
    calls.expired += 1;
    return { expired: 1 };
  },
}));
vi.mock("@/lib/security/alerts", () => ({
  runSecurityAlerts: async () => {
    calls.alerts += 1;
    if (calls.alertsFail) throw new Error("db");
    return { alerts: [], sent: [] };
  },
}));

const SECRET = "test-cron-secret-0123456789";
const authed = (path: string) => new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${SECRET}` } });

afterEach(() => {
  calls.completeFails = false;
  calls.alertsFail = false;
  calls.expired = 0;
  calls.alerts = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("complete-bookings cron", () => {
  it("runs the host-asked timeout even when completing bookings throws, and answers 500", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    calls.completeFails = true;
    const { GET } = await import("./route");
    const res = await GET(authed("/api/cron/complete-bookings"));
    expect(calls.expired).toBe(1);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, completed: { error: "failed" }, hostAskedExpired: 1 });
  });

  it("answers both results when both succeed", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { GET } = await import("./route");
    const res = await GET(authed("/api/cron/complete-bookings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, completed: { completed: 2 }, hostAskedExpired: 1 });
  });
});

describe("security-alerts cron", () => {
  it("also runs the host-asked timeout every hour, independently of the alerts", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    calls.alertsFail = true;
    const { GET } = await import("../security-alerts/route");
    const res = await GET(authed("/api/cron/security-alerts"));
    expect(calls.alerts).toBe(1);
    expect(calls.expired).toBe(1);
    expect(res.status).toBe(500);
  });
});
