/**
 * One run of the founder's hourly security alerts (src/lib/security/alerts.ts; SECURITY_REPORT
 * 16.3): the window, the once-per-kind-per-hour memory, a delivery nobody accepted (sent again next
 * hour), the daily certificate check, and late support tickets alerting once per waiting spell
 * (founder's answer 9). Everything outside is injected; no database, email or Telegram.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runSecurityAlerts, windowStart, registrableDomain, rdapExpiryDaysLeft } = await import("./alerts");
type Deps = NonNullable<Parameters<typeof runSecurityAlerts>[0]>;
type State = Awaited<ReturnType<NonNullable<Deps["readState"]>>>;
type Signals = Awaited<ReturnType<NonNullable<Deps["collect"]>>>;

const HOUR = 3600 * 1000;
const NOW = new Date("2026-11-10T12:00:00Z"); // a Tuesday

function signals(over: Partial<Signals> = {}): Signals {
  return {
    events: {},
    perIpMax: {},
    staffNewDevices: 0,
    staffSecurityChanges: 0,
    maintenanceOn: 0,
    maintenanceOff: 0,
    roleChanges: 0,
    signupsSite: 0,
    signupsPerIpMax: 0,
    listingsCreated: 0,
    bookingsCreated: 0,
    offsite: null,
    certificateDaysLeft: null,
    now: NOW,
    ...over,
  };
}

function harness(
  opts: {
    state?: State;
    signals?: Partial<Signals>;
    delivered?: boolean | (() => boolean);
    tickets?: { id: string; number: number; waitingSince: Date }[];
    /** When set, the signals exist only while this event time is inside the run's [since, now]. */
    eventAt?: Date;
  } = {},
) {
  let state: State = opts.state ?? {};
  const delivered = () => (typeof opts.delivered === "function" ? opts.delivered() : (opts.delivered ?? true));
  const deliver = vi.fn<NonNullable<Deps["deliver"]>>(async () => ({ email: delivered(), telegram: 0 }));
  const collect = vi.fn(async (since: Date, now: Date, extra: { certificateDaysLeft?: number | null }) => {
    const inWindow = !opts.eventAt || (opts.eventAt >= since && opts.eventAt <= now);
    return signals({ ...(inWindow ? opts.signals : {}), certificateDaysLeft: extra.certificateDaysLeft ?? null });
  });
  const deps = (now: Date): Deps => ({
    now,
    claim: async () => true,
    readState: async () => state,
    writeState: async (next) => {
      state = next;
    },
    collect,
    deliver,
    certificateHost: () => null,
    waitingTickets: async () => opts.tickets ?? [],
  });
  return { deps, deliver, collect, state: () => state };
}

describe("runSecurityAlerts", () => {
  it("a second run in the same hour does not repeat an alert", async () => {
    const h = harness({ signals: { staffNewDevices: 1 } });
    const first = await runSecurityAlerts(h.deps(NOW));
    expect(first.sent).toEqual(["staff_new_device"]);
    const second = await runSecurityAlerts(h.deps(new Date(NOW.getTime() + 20 * 60_000)));
    expect(second.alerts).toEqual(["staff_new_device"]);
    expect(second.sent).toEqual([]);
    expect(h.deliver).toHaveBeenCalledTimes(1);
    const later = await runSecurityAlerts(h.deps(new Date(NOW.getTime() + HOUR)));
    expect(later.sent).toEqual(["staff_new_device"]);
  });

  it("nothing accepted the message: it goes again on the next run", async () => {
    const h = harness({ signals: { roleChanges: 1 }, delivered: false });
    expect((await runSecurityAlerts(h.deps(NOW))).sent).toEqual([]);
    expect(h.state().lastSent).toEqual({});
    await runSecurityAlerts(h.deps(new Date(NOW.getTime() + 5 * 60_000)));
    expect(h.deliver).toHaveBeenCalledTimes(2);
  });

  it("an undelivered alert is counted again an hour later: the window goes back to where it began (ops-alerts-2)", async () => {
    let up = false;
    const h = harness({
      state: { lastRunAt: new Date(NOW.getTime() - HOUR).toISOString() },
      signals: { staffNewDevices: 1 },
      eventAt: new Date(NOW.getTime() - 30 * 60_000),
      delivered: () => up,
    });
    expect((await runSecurityAlerts(h.deps(NOW))).sent).toEqual([]);
    // The window did not move on.
    expect(h.state().lastRunAt).toBe(new Date(NOW.getTime() - HOUR).toISOString());
    up = true;
    const next = await runSecurityAlerts(h.deps(new Date(NOW.getTime() + HOUR)));
    expect(next.sent).toEqual(["staff_new_device"]);
    expect(h.deliver).toHaveBeenCalledTimes(2);
    expect(h.deliver.mock.calls[1]![1]).toBe(120);
    expect(h.state().lastRunAt).toBe(new Date(NOW.getTime() + HOUR).toISOString());
  });

  it("a quiet run moves the window on", async () => {
    const h = harness({ state: { lastRunAt: new Date(NOW.getTime() - HOUR).toISOString() }, delivered: false });
    await runSecurityAlerts(h.deps(NOW));
    expect(h.state().lastRunAt).toBe(NOW.toISOString());
  });

  it("another run already holds the claim: nothing happens", async () => {
    const h = harness({ signals: { staffNewDevices: 1 } });
    const result = await runSecurityAlerts({ ...h.deps(NOW), claim: async () => false });
    expect(result).toEqual({ skipped: "already_running", alerts: [], sent: [] });
    expect(h.collect).not.toHaveBeenCalled();
  });

  it("checks the certificate once a day, on the real site's host only", async () => {
    const check = vi.fn(async () => 10);
    const h = harness();
    const base = h.deps(NOW);
    const run = (at: Date) => runSecurityAlerts({ ...h.deps(at), certificateHost: () => "bayit.example", checkCertificate: check });
    expect((await run(NOW)).alerts).toEqual(["certificate_expiry"]);
    await run(new Date(NOW.getTime() + 2 * HOUR));
    expect(check).toHaveBeenCalledTimes(1);
    await run(new Date(NOW.getTime() + 25 * HOUR));
    expect(check).toHaveBeenCalledTimes(2);
    expect(base.certificateHost?.()).toBeNull();
  });

  it("checks the domain registration once a day and alerts within 30 days (ops-alerts-1)", async () => {
    const domain = vi.fn(async () => 25);
    const h = harness();
    const run = (at: Date) =>
      runSecurityAlerts({ ...h.deps(at), certificateHost: () => "www.bayit.example", checkCertificate: async () => 300, checkDomain: domain });
    expect((await run(NOW)).alerts).toEqual(["domain_expiry"]);
    expect(domain).toHaveBeenCalledWith("bayit.example", NOW);
    await run(new Date(NOW.getTime() + 2 * HOUR));
    expect(domain).toHaveBeenCalledTimes(1);
    expect(h.state().domainDaysLeft).toBe(25);
    domain.mockResolvedValueOnce(200);
    expect((await run(new Date(NOW.getTime() + 25 * HOUR))).alerts).toEqual([]);
  });

  it("a burst of server errors alerts (ops-alerts-1)", async () => {
    const h = harness({ signals: { events: { server_error: 21 } } });
    expect((await runSecurityAlerts(h.deps(NOW))).sent).toEqual(["error_spike"]);
  });

  it("a late support ticket alerts once per waiting spell", async () => {
    // Waiting since Sunday 10:00 Israel time: due Monday 10:00, so late on Tuesday.
    const tickets = [{ id: "t1", number: 41, waitingSince: new Date("2026-11-08T08:00:00Z") }];
    const h = harness({ tickets });
    const first = await runSecurityAlerts(h.deps(NOW));
    expect(first.sent).toEqual(["support_overdue"]);
    expect(h.deliver.mock.calls[0]![0]).toEqual([{ kind: "support_overdue", count: 1, tickets: [41] }]);
    // Hours later, still late and still unanswered: no second alert for the same ticket.
    const again = await runSecurityAlerts(h.deps(new Date(NOW.getTime() + 3 * HOUR)));
    expect(again.alerts).toEqual([]);
    expect(h.state().supportAlerted).toEqual({ t1: tickets[0]!.waitingSince.toISOString() });
  });

  it("a late ticket not yet due by the hourly memory waits, then goes", async () => {
    const h = harness({ state: { lastSent: { support_overdue: new Date(NOW.getTime() - 10 * 60_000).toISOString() } }, tickets: [{ id: "t2", number: 7, waitingSince: new Date("2026-11-08T08:00:00Z") }] });
    expect((await runSecurityAlerts(h.deps(NOW))).sent).toEqual([]);
    expect(h.state().supportAlerted).toEqual({});
    expect((await runSecurityAlerts(h.deps(new Date(NOW.getTime() + HOUR)))).sent).toEqual(["support_overdue"]);
  });
});

describe("windowStart", () => {
  it("at least an hour; back to the last run when it is recent; clamped to 3 hours after a longer gap (ops-alerts-3)", () => {
    expect(windowStart(NOW, undefined).toISOString()).toBe(new Date(NOW.getTime() - HOUR).toISOString());
    expect(windowStart(NOW, new Date(NOW.getTime() - 90 * 60_000).toISOString()).toISOString()).toBe(new Date(NOW.getTime() - 90 * 60_000).toISOString());
    expect(windowStart(NOW, new Date(NOW.getTime() - 10 * HOUR).toISOString()).toISOString()).toBe(new Date(NOW.getTime() - 3 * HOUR).toISOString());
    expect(windowStart(NOW, "not a date").toISOString()).toBe(new Date(NOW.getTime() - HOUR).toISOString());
  });
});

describe("domain expiry helpers", () => {
  it("the registrable domain of the site's host", () => {
    expect(registrableDomain("www.bayit.ge")).toBe("bayit.ge");
    expect(registrableDomain("bayit.ge")).toBe("bayit.ge");
    expect(registrableDomain("a.bayit.com.ge")).toBe("bayit.com.ge");
    expect(registrableDomain("localhost")).toBeNull();
  });

  it("reads the RDAP expiration event; anything else is null", () => {
    const body = { events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2026-12-10T12:00:00Z" }] };
    expect(rdapExpiryDaysLeft(body, NOW)).toBe(30);
    expect(rdapExpiryDaysLeft({ events: [] }, NOW)).toBeNull();
    expect(rdapExpiryDaysLeft(null, NOW)).toBeNull();
    expect(rdapExpiryDaysLeft({ events: [{ eventAction: "expiration", eventDate: "nope" }] }, NOW)).toBeNull();
  });
});
