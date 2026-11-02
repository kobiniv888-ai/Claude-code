import { describe, expect, it } from "vitest";
import { cleanFirstName, firstNameOf, looksLikeContact, needsFirstName, personName } from "./first-name";
import { firstNameSchema } from "./first-name-schema";

describe("first names (brief 5.8, bug 8.2)", () => {
  it("spots phone numbers, placeholders and emails", () => {
    for (const value of ["+972", "+972 50 123 4567", "0501234567", "050-123", "995555000011@phone.bayit.invalid", "noa@example.com"]) {
      expect(looksLikeContact(value), value).toBe(true);
    }
    for (const value of ["Noa", "נועה", "E2E User 1234", "Anna-Maria", "ნინო", "Room 101"]) {
      expect(looksLikeContact(value), value).toBe(false);
    }
  });

  it("cleans a first name or refuses it", () => {
    expect(cleanFirstName("  נועה  ")).toBe("נועה");
    expect(cleanFirstName("Mary  Ann")).toBe("Mary Ann");
    expect(cleanFirstName("")).toBeNull();
    expect(cleanFirstName("+972 50 123 4567")).toBeNull();
    expect(cleanFirstName("x".repeat(41))).toBeNull();
  });

  it("uses User.firstName, else the first word of a real name", () => {
    expect(firstNameOf({ firstName: "Dana", name: "Noa Levi" })).toBe("Dana");
    expect(firstNameOf({ firstName: null, name: "Noa Levi" })).toBe("Noa");
    expect(firstNameOf({ firstName: null, name: "+995 555 12 34 56" })).toBeNull();
    expect(firstNameOf({ firstName: null, name: "" })).toBeNull();
  });

  it("asks new accounts for a first name, never demo accounts", () => {
    expect(needsFirstName({ firstName: null, name: "", isDemo: false })).toBe(true);
    expect(needsFirstName({ firstName: null, name: "+972 50 123 4567", isDemo: false })).toBe(true);
    expect(needsFirstName({ firstName: "Noa", name: "", isDemo: false })).toBe(false);
    expect(needsFirstName({ firstName: null, name: "Yossi Cohen", isDemo: false })).toBe(false);
    expect(needsFirstName({ firstName: null, name: "", isDemo: true })).toBe(false);
  });

  it("never names a person after their phone or email", () => {
    expect(personName({ name: "+972 50 123 4567", firstName: "Noa" })).toBe("Noa");
    expect(personName({ name: "995555000011@phone.bayit.invalid", firstName: null })).toBeNull();
    expect(personName({ name: "Noa Levi", firstName: "Noa" })).toBe("Noa Levi");
  });

  it("validates the form", () => {
    expect(firstNameSchema.safeParse({ firstName: " Noa " }).data).toEqual({ firstName: "Noa" });
    expect(firstNameSchema.safeParse({ firstName: "" }).error?.issues[0]?.message).toBe("required");
    expect(firstNameSchema.safeParse({ firstName: "+972501234567" }).error?.issues[0]?.message).toBe("not_a_name");
    expect(firstNameSchema.safeParse({ firstName: "x".repeat(41) }).error?.issues[0]?.message).toBe("too_long");
  });
});
