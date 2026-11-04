import { describe, expect, it } from "vitest";
import { pickChanged } from "./patch";
import { stepSaveSchemas, STEP_FIELDS } from "./schemas";
import { isOptionalStep, OPTIONAL_STEPS, stepAfter, stepNumber, stepsFor, type ListingKind } from "./steps";

/* Round 3, brief 3: step 9 (Jewish-friendly details) is optional with a "דילוג" button. */

const apartment: ListingKind = { dealType: "SHORT_STAY", propertyType: "APARTMENT" };
const rent: ListingKind = { dealType: "MONTHLY_RENT", propertyType: "APARTMENT" };
const sale: ListingKind = { dealType: "SALE", propertyType: "HOUSE" };
const hotel: ListingKind = { dealType: "HOTEL_ROOM", propertyType: "HOTEL" };

describe("optional steps", () => {
  it("only the Jewish-friendly step is optional", () => {
    expect(OPTIONAL_STEPS).toEqual(["jewish"]);
    expect(isOptionalStep("jewish")).toBe(true);
    for (const step of stepsFor(apartment).filter((s) => s !== "jewish")) expect(isOptionalStep(step)).toBe(false);
  });

  it("it is step 9 for homes, and every kind of listing has it", () => {
    expect(stepNumber("jewish", apartment)).toBe(9);
    expect(stepNumber("jewish", rent)).toBe(9);
    for (const kind of [apartment, rent, sale, hotel]) expect(stepsFor(kind)).toContain("jewish");
  });

  it("Skip goes to the step right after it (photos), for every kind", () => {
    for (const kind of [apartment, rent, sale, hotel]) {
      const steps = stepsFor(kind);
      expect(stepAfter("jewish", kind)).toBe(steps[steps.indexOf("jewish") + 1]);
      expect(stepAfter("jewish", kind)).toBe("photos");
    }
    expect(stepAfter("publish", apartment)).toBeNull();
    // A step this kind does not have: nowhere to skip to.
    expect(stepAfter("rooms", apartment)).toBeNull();
  });
});

describe("check-in / check-out flexible answers are saved like the times", () => {
  it("both steps that hold the times also own the flexible flags", () => {
    for (const step of ["amenities", "booking"] as const) {
      expect(STEP_FIELDS[step]).toEqual(expect.arrayContaining(["checkInFrom", "checkOutUntil", "checkInFlexible", "checkOutFlexible"]));
    }
    for (const schema of [stepSaveSchemas.amenities, stepSaveSchemas.booking]) {
      expect(schema.shape.checkInFlexible.safeParse(true).success).toBe(true);
      expect(schema.shape.checkOutFlexible.safeParse(false).success).toBe(true);
      expect(schema.shape.checkInFlexible.safeParse("yes").success).toBe(false);
    }
  });

  it("a picked 'flexible' is sent as a patch with the emptied time", () => {
    const values = { checkInFrom: "", checkInFlexible: true, checkOutUntil: "11:00", checkOutFlexible: false } as never;
    expect(pickChanged("booking", values, new Set(["checkInFrom", "checkInFlexible"]))).toEqual({ checkInFrom: "", checkInFlexible: true });
  });

  it("an existing off-list time is still a valid saved value (never rejected)", () => {
    expect(stepSaveSchemas.booking.shape.checkInFrom.safeParse("10:00").success).toBe(true);
    expect(stepSaveSchemas.amenities.shape.checkInFrom.safeParse("10:00").success).toBe(true);
  });
});
