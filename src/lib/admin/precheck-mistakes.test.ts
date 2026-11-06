import { describe, expect, it } from "vitest";
import { precheckMistakes } from "./precheck";

describe("precheckMistakes (the admin review page's host mistake check)", () => {
  it("is unchecked when the check failed", () => {
    expect(precheckMistakes(null)).toEqual({ status: "unchecked", issues: [], errors: 0, warnings: 0 });
  });

  it("is ok when clean, found with warnings only, blocked with any error (errors listed first)", () => {
    expect(precheckMistakes({ errors: [], warnings: [] }).status).toBe("ok");
    const warning = { code: "no_bathrooms", severity: "warning" as const };
    const error = { code: "address_missing", severity: "error" as const };
    expect(precheckMistakes({ errors: [], warnings: [warning] })).toMatchObject({ status: "found", errors: 0, warnings: 1 });
    const blocked = precheckMistakes({ errors: [error], warnings: [warning] });
    expect(blocked).toMatchObject({ status: "blocked", errors: 1, warnings: 1 });
    expect(blocked.issues.map((i) => i.code)).toEqual(["address_missing", "no_bathrooms"]);
  });
});
