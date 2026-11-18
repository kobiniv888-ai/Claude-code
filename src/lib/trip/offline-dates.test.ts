/**
 * i18n-1 (round 3, phase 5 hardening): the offline page lists saved trips with their dates as the
 * trip page writes them in the guest's language ("10–12 בדצמ׳"), not raw ISO dates. The index
 * keeps that label; copies saved before it still parse (and show the ISO dates).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOfflineIndex } from "./offline";

const entry = {
  path: "/he/account/trips/BT-7K3Q9",
  code: "BT-7K3Q9",
  owner: "owner-key",
  title: "דירה בבטומי",
  checkIn: "2026-12-10",
  checkOut: "2026-12-12",
  status: "CONFIRMED",
  savedAt: "2026-11-07T10:00:00.000Z",
  keepUntil: "2026-12-19",
  version: "v1",
};

describe("the offline index's dates label", () => {
  it("is kept when it is a short string", () => {
    expect(parseOfflineIndex({ trips: [{ ...entry, datesLabel: "10–12 בדצמ׳" }] })[0].datesLabel).toBe("10–12 בדצמ׳");
  });

  it("is optional: an entry without it still parses", () => {
    const [parsed] = parseOfflineIndex({ trips: [entry] });
    expect(parsed.code).toBe("BT-7K3Q9");
    expect(parsed).not.toHaveProperty("datesLabel");
  });

  it("is left out when it is not a string (the entry stays)", () => {
    const [parsed] = parseOfflineIndex({ trips: [{ ...entry, datesLabel: { html: "<b>x</b>" } }] });
    expect(parsed.code).toBe("BT-7K3Q9");
    expect(parsed).not.toHaveProperty("datesLabel");
  });

  it("is what the offline page shows (as text), with the ISO dates as the fallback", () => {
    const offline = fs.readFileSync(path.join(process.cwd(), "public", "offline.html"), "utf8");
    expect(offline).toContain('typeof t.datesLabel === "string"');
    expect(offline).toContain("document.createTextNode(\" · \" + t.datesLabel)");
    expect(offline).not.toMatch(/innerHTML\s*=.*datesLabel/);
  });
});
