/**
 * The founder's security alerts (SECURITY_REPORT 16.3, 4.7.a, 3.8.c): every rule, the hourly
 * dedupe, sign-ups as ONE alert-only kind (founder's answer 6), late support tickets (answer 9),
 * and the email / Telegram lines in all 5 languages (counts only; never an address, answer 10).
 */
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { locales } from "@/config/site";
import { securityAlertLines, securityAlertTelegramText } from "./alerts-email-template";
import {
  SECURITY_ALERT_KINDS,
  SECURITY_ALERT_THRESHOLDS as T,
  dueAlerts,
  evaluateSecurityAlerts,
  repeatMinutesFor,
  type SecuritySignals,
} from "./alerts-rules";

const NOW = new Date("2026-11-09T10:00:00Z");

function quiet(over: Partial<SecuritySignals> = {}): SecuritySignals {
  return {
    events: {},
    perIpMax: {},
    staffNewDevices: 0,
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

const kinds = (s: SecuritySignals) => evaluateSecurityAlerts(s).map((a) => a.kind);

describe("evaluateSecurityAlerts", () => {
  it("a quiet hour alerts nothing", () => {
    expect(kinds(quiet())).toEqual([]);
  });

  it("one-by-one events alert from the first one", () => {
    expect(
      kinds(
        quiet({
          staffNewDevices: 1,
          roleChanges: 1,
          maintenanceOn: 1,
          maintenanceOff: 1,
          events: { totp_locked: 1, totp_unlock_email: 1, recovery_code_used: 1, all_sessions_ended: 1, offsite_backup_failed: 1, sms_budget_reached: 1 },
        }),
      ).sort(),
    ).toEqual(
      ["maintenance_off", "maintenance_on", "offsite_backup_failed", "recovery_code_used", "role_changed", "sessions_ended", "sms_paused", "staff_new_device", "totp_locked", "totp_unlock_email"].sort(),
    );
    expect(kinds(quiet({ events: { sms_ratio_low: 1 } }))).toEqual(["sms_paused"]);
  });

  it("bursts alert only above their threshold", () => {
    const at = quiet({
      events: {
        login_failed: T.loginFailuresSite,
        login_code_locked: T.loginCodesLocked,
        email_code_sent: T.codeSends,
        permission_denied: T.permissionDenialsSite,
        id_not_found: T.idMissesSite,
        rate_limited: T.rateLimited,
        csp_report: T.cspReports,
        booking_cap_hit: T.bookingCapHits,
        show_contact_cap_hit: T.showContactCapHits,
      },
      perIpMax: { login_failed: T.loginFailuresPerIp, permission_denied: T.permissionDenialsPerIp, id_not_found: T.idMissesPerIp },
      signupsSite: T.signupsSite,
      signupsPerIpMax: T.signupsPerIp,
      listingsCreated: T.listingsCreated,
      bookingsCreated: T.bookingsCreated,
    });
    expect(kinds(at)).toEqual([]);
    const above = quiet({
      events: Object.fromEntries(Object.entries(at.events).map(([k, v]) => [k, (v ?? 0) + 1])),
      perIpMax: Object.fromEntries(Object.entries(at.perIpMax).map(([k, v]) => [k, (v ?? 0) + 1])),
      signupsSite: T.signupsSite + 1,
      listingsCreated: T.listingsCreated + 1,
      bookingsCreated: T.bookingsCreated + 1,
    });
    expect(kinds(above).sort()).toEqual(
      [
        "booking_burst",
        "booking_cap",
        "code_sends",
        "csp_reports",
        "id_guessing",
        "id_guessing_ip",
        "listing_burst",
        "login_codes_locked",
        "login_failures",
        "login_failures_ip",
        "permission_denials",
        "permission_denials_ip",
        "rate_limited",
        "show_contact_cap",
        "signup_burst",
      ].sort(),
    );
  });

  it("codes sent count email and SMS together", () => {
    expect(kinds(quiet({ events: { email_code_sent: T.codeSends, sms_code_sent: 1 } }))).toEqual(["code_sends"]);
  });

  it("a capped burst of CSP reports alerts even under the threshold", () => {
    expect(kinds(quiet({ events: { csp_report: 3, csp_report_capped: 1 } }))).toEqual(["csp_reports"]);
  });

  it("sign-ups: ONE kind for the site-wide and the one-connection burst, with both numbers (answer 6)", () => {
    const site = evaluateSecurityAlerts(quiet({ signupsSite: T.signupsSite + 4, signupsPerIpMax: 2 }));
    const ip = evaluateSecurityAlerts(quiet({ signupsSite: 7, signupsPerIpMax: T.signupsPerIp + 1 }));
    const both = evaluateSecurityAlerts(quiet({ signupsSite: T.signupsSite + 9, signupsPerIpMax: T.signupsPerIp + 3 }));
    for (const alerts of [site, ip, both]) {
      expect(alerts.filter((a) => a.kind.startsWith("signup"))).toHaveLength(1);
    }
    expect(ip[0]).toMatchObject({ kind: "signup_burst", count: 7, perIp: T.signupsPerIp + 1, threshold: T.signupsSite, perIpThreshold: T.signupsPerIp });
    expect(SECURITY_ALERT_KINDS.filter((k) => k.startsWith("signup"))).toEqual(["signup_burst"]);
  });

  it("off-site backup: missing for 8 days, or never, once it is set up", () => {
    const day = 86_400_000;
    expect(kinds(quiet({ offsite: { configured: false, lastOkAt: null } }))).toEqual([]);
    expect(kinds(quiet({ offsite: { configured: true, lastOkAt: new Date(NOW.getTime() - 3 * day) } }))).toEqual([]);
    expect(kinds(quiet({ offsite: { configured: true, lastOkAt: new Date(NOW.getTime() - 8 * day) } }))).toEqual(["offsite_backup_missing"]);
    expect(kinds(quiet({ offsite: { configured: true, lastOkAt: null } }))).toEqual(["offsite_backup_missing"]);
  });

  it("the certificate alerts within 21 days", () => {
    expect(kinds(quiet({ certificateDaysLeft: 22 }))).toEqual([]);
    expect(evaluateSecurityAlerts(quiet({ certificateDaysLeft: 20 }))).toEqual([{ kind: "certificate_expiry", count: 1, days: 20 }]);
  });

  it("late support tickets: one alert with the ticket numbers (answer 9)", () => {
    expect(kinds(quiet({ supportOverdue: [] }))).toEqual([]);
    const many = Array.from({ length: 14 }, (_, i) => i + 1);
    const [alert] = evaluateSecurityAlerts(quiet({ supportOverdue: many }));
    expect(alert).toMatchObject({ kind: "support_overdue", count: 14 });
    expect(alert!.tickets).toHaveLength(10);
  });
});

describe("dueAlerts: once per kind per hour (daily for the slow kinds)", () => {
  const alerts = evaluateSecurityAlerts(quiet({ staffNewDevices: 1, certificateDaysLeft: 5 }));

  it("never sent → due", () => {
    expect(dueAlerts(alerts, {}, NOW).map((a) => a.kind)).toEqual(["staff_new_device", "certificate_expiry"]);
  });

  it("sent 30 minutes ago → not due; an hour later → due again; the certificate waits a day", () => {
    const half = new Date(NOW.getTime() - 30 * 60_000).toISOString();
    expect(dueAlerts(alerts, { staff_new_device: half, certificate_expiry: half }, NOW)).toEqual([]);
    const hour = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(dueAlerts(alerts, { staff_new_device: hour, certificate_expiry: hour }, NOW).map((a) => a.kind)).toEqual(["staff_new_device"]);
    expect(repeatMinutesFor("certificate_expiry")).toBe(24 * 60);
    expect(repeatMinutesFor("signup_burst")).toBe(60);
  });
});

function translatorFor(locale: string) {
  const messages = { emails: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, "emails.json"), "utf8")) };
  const t = createTranslator({ locale, messages, namespace: "emails" });
  return (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
}

describe("the alert texts (email and Telegram), 5 languages", () => {
  const every = SECURITY_ALERT_KINDS.map((kind) => ({
    kind,
    count: 3,
    threshold: 2,
    days: 4,
    ...(kind === "signup_burst" ? { perIp: 6, perIpThreshold: 5 } : {}),
    ...(kind === "support_overdue" ? { tickets: [12, 15, 31] } : {}),
  }));

  for (const locale of locales) {
    it(`${locale}: every kind has a line, values filled in, no personal data`, () => {
      const t = translatorFor(locale);
      const lines = securityAlertLines(every, t);
      expect(lines).toHaveLength(SECURITY_ALERT_KINDS.length);
      for (const line of lines) {
        expect(line).not.toMatch(/[{}]/);
        expect(line).not.toMatch(/templates\.security_alert/);
      }
      const support = lines[SECURITY_ALERT_KINDS.indexOf("support_overdue")]!;
      expect(support).toContain("#12, #15, #31");
      const signup = lines[SECURITY_ALERT_KINDS.indexOf("signup_burst")]!;
      expect(signup).toContain("6");
      const telegram = securityAlertTelegramText(every, t, 60);
      expect(telegram).not.toMatch(/@|\+\d{6,}|https?:\/\//);
    });
  }
});
