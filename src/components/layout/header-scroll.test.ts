import { describe, expect, it } from "vitest";
import { headerScrollStep, HIDE_AFTER_PX } from "./header-scroll";

const base = { compact: true, reducedMotion: false, locked: false };

describe("headerScrollStep", () => {
  it("hides on the way down and shows on the way up (phones)", () => {
    expect(headerScrollStep({ ...base, y: 400, lastY: 300 })).toEqual({ hidden: true, lastY: 400 });
    expect(headerScrollStep({ ...base, y: 380, lastY: 400 })).toEqual({ hidden: false, lastY: 380 });
  });

  it("always shows near the top of the page", () => {
    expect(headerScrollStep({ ...base, y: HIDE_AFTER_PX - 1, lastY: 0 })).toEqual({ hidden: false, lastY: HIDE_AFTER_PX - 1 });
    expect(headerScrollStep({ ...base, y: -20, lastY: 10 })).toEqual({ hidden: false, lastY: 0 });
  });

  it("ignores small jitters and keeps measuring from the last decision", () => {
    expect(headerScrollStep({ ...base, y: 403, lastY: 400 })).toEqual({ hidden: null, lastY: 400 });
  });

  it("never hides on desktop or with reduced motion", () => {
    expect(headerScrollStep({ ...base, compact: false, y: 900, lastY: 100 }).hidden).toBe(false);
    expect(headerScrollStep({ ...base, reducedMotion: true, y: 900, lastY: 100 }).hidden).toBe(false);
  });

  it("freezes while a sheet, dialog or the menu has locked the page", () => {
    expect(headerScrollStep({ ...base, locked: true, y: 900, lastY: 100 })).toEqual({ hidden: null, lastY: 900 });
  });
});
