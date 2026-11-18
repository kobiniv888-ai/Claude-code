/**
 * The report emails (round 3, brief 8.2): the founder's email is urgent for turned-away reports
 * and never names the reporter; the host's emails never name the reporter, except the one sent
 * when the founder decides to (first name only); the cancellation email links to the form.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "use-intl/core";
import { locales } from "@/config/site";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
    const messages = { [namespace]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace, onError: (e) => { throw e; } });
  },
}));
vi.mock("@/lib/db", () => ({ db: { emailOutbox: { create: vi.fn(async () => undefined) } } }));

const { renderEmail } = await import("@/lib/email");

const REPORTER = "Noa";
const reportAdmin = {
  kind: "TURNED_AWAY" as const,
  reason: "CANCELLED_FOR_IDENTITY",
  targetType: "USER",
  listingTitle: "Sunny flat in Vake",
  listingPublicId: 1234,
  hostName: "Yossi",
  bookingCode: "BT-7K3Q9",
  happenedOn: "2026-11-02",
  screenshots: 2,
  adminUrl: "/admin/reports/rep_1",
};

describe("the founder's email", () => {
  it("is urgent for a turned-away report, in every language, and links to the report", async () => {
    for (const locale of locales) {
      const urgent = await renderEmail("report_admin", locale, reportAdmin);
      const general = await renderEmail("report_admin", locale, { ...reportAdmin, kind: "GENERAL", reason: "WRONG_PRICE", targetType: "LISTING" });
      expect(urgent.subject, locale).not.toBe(general.subject);
      expect(urgent.text, locale).toMatch(new RegExp(`/${locale}/admin/reports/rep_1`));
      expect(urgent.text, locale).toContain("BT-7K3Q9");
    }
    const en = await renderEmail("report_admin", "en", reportAdmin);
    expect(en.subject).toMatch(/^Urgent/);
    expect(en.text).toContain("The host cancelled because of who the guest is");
    expect(en.text).toContain("2 screenshots");
  });

  it("names nobody who reported (the data has no reporter at all)", async () => {
    expect(Object.keys(reportAdmin)).not.toEqual(expect.arrayContaining(["reporterName"]));
    const en = await renderEmail("report_admin", "en", reportAdmin);
    expect(en.text).not.toContain(REPORTER);
    expect(en.text).toContain("The host doesn't know who reported");
  });

  it("names the host in the subject (plain text: subjects drop the bidi marks)", async () => {
    const he = await renderEmail("report_admin", "he", { ...reportAdmin, hostName: "Yossi Levi" });
    expect(he.subject).toContain("Yossi Levi");
    expect(he.subject).not.toMatch(/[⁨⁩]/);
  });
});

describe("the guest's confirmation", () => {
  it("confirms, says the host doesn't know, and links to the trip", async () => {
    const he = await renderEmail("report_received", "he", { name: REPORTER, bookingCode: "BT-7K3Q9", happenedOn: "2026-11-02", tripsUrl: "/account/trips/BT-7K3Q9" });
    expect(he.text).toContain("BT-7K3Q9");
    expect(he.text).toMatch(/\/he\/account\/trips\/BT-7K3Q9/);
    const en = await renderEmail("report_received", "en", { name: REPORTER, listingTitle: "Sunny flat", happenedOn: "2026-11-02", tripsUrl: null });
    expect(en.text).toContain("The host doesn't know who reported");
    expect(en.text).toMatch(/\/en\/account\/trips/);
  });
});

describe("the host's emails", () => {
  it("hiding the listings gives the reason and never the reporter", async () => {
    for (const locale of locales) {
      const email = await renderEmail("report_host_listings_hidden", locale, { name: "Yossi", count: 3, reasonText: "Turning guests away" });
      expect(email.text, locale).toContain("Turning guests away");
      expect(email.text, locale).not.toContain(REPORTER);
    }
  });

  it("only the reveal email names the reporter, by first name", async () => {
    const email = await renderEmail("report_reporter_revealed", "en", {
      name: "Yossi",
      reporterName: REPORTER,
      bookingCode: "BT-7K3Q9",
      listingTitle: null,
      happenedOn: "2026-11-02",
      reason: "ASKED_RELIGION_OR_ORIGIN",
      note: null,
    });
    expect(email.text).toContain(REPORTER);
    expect(email.text).toContain("The host asked about the guest's religion or origin");
  });
});

describe("the host-cancellation email", () => {
  it("links to the trip page with the report form open", async () => {
    for (const locale of locales) {
      const email = await renderEmail("booking_cancelled_by_host", locale, {
        code: "BT-7K3Q9",
        listingTitle: "Sunny flat in Vake",
        checkIn: "2026-11-12",
        checkOut: "2026-11-15",
        nights: 3,
        adults: 2,
        children: 0,
        infants: 0,
        total: 275,
        currency: "USD",
        bookingUrl: "/account/trips/BT-7K3Q9",
        guestName: REPORTER,
        reasonCode: "OTHER",
        reasonText: null,
        searchUrl: "/search",
      });
      expect(email.html, locale).toMatch(new RegExp(`/${locale}/account/trips/BT-7K3Q9\\?report=1`));
      expect(email.text, locale).toMatch(/\?report=1/);
    }
  });
});
