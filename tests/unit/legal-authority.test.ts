/**
 * LP-5 (checklist 15.3): the Georgian personal-data authority's work moved to the State Audit
 * Office in March 2026. No language of the privacy policy, and not the incident plan, still sends
 * people (or the founder's 72-hour breach report) to the old service or its website.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const OLD = /personaldata\.ge|Personal Data Protection Service|Служб[ау] защиты персональных данных|პერსონალურ მონაცემთა დაცვის სამსახურ|לשירות להגנת מידע אישי|هيئة حماية البيانات الشخصية في جورجيا/i;

describe("the Georgian data-protection authority (LP-5)", () => {
  it("no legal.json and not INCIDENT_PLAN.md names the old service", () => {
    for (const locale of ["he", "en", "ru", "ar", "ka"]) {
      expect(fs.readFileSync(path.join(ROOT, "messages", locale, "legal.json"), "utf8"), locale).not.toMatch(OLD);
    }
    expect(fs.readFileSync(path.join(ROOT, "INCIDENT_PLAN.md"), "utf8")).not.toMatch(OLD);
  });

  it("the incident plan names the State Audit Office for the 72-hour report", () => {
    expect(fs.readFileSync(path.join(ROOT, "INCIDENT_PLAN.md"), "utf8")).toMatch(/State Audit Office/);
    expect(fs.readFileSync(path.join(ROOT, "messages", "en", "legal.json"), "utf8")).toMatch(/State Audit Office of Georgia/);
  });
});
