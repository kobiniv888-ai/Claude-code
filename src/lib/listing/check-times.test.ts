import { describe, expect, it } from "vitest";
import {
  CHECK_TIMES,
  checkTimeDisplay,
  checkTimeFromSelect,
  checkTimeOptions,
  checkTimeSelectValue,
  clockLabel,
  FLEXIBLE_VALUE,
  isUnusualCheckTime,
  normalizeClock,
  timeRange,
} from "./check-times";

/* Round 3, brief 3: the check-in / check-out pickers and how times read in each language. */

describe("check-in / check-out options", () => {
  it("check-in offers 12:00–22:00 every 30 minutes", () => {
    expect(CHECK_TIMES.checkIn[0]).toBe("12:00");
    expect(CHECK_TIMES.checkIn.at(-1)).toBe("22:00");
    expect(CHECK_TIMES.checkIn).toHaveLength(21);
    expect(CHECK_TIMES.checkIn.slice(0, 4)).toEqual(["12:00", "12:30", "13:00", "13:30"]);
  });

  it("check-out offers 07:00–14:00 every 30 minutes", () => {
    expect(CHECK_TIMES.checkOut[0]).toBe("07:00");
    expect(CHECK_TIMES.checkOut.at(-1)).toBe("14:00");
    expect(CHECK_TIMES.checkOut).toHaveLength(15);
    expect(CHECK_TIMES.checkOut).toContain("11:00");
    expect(CHECK_TIMES.checkOut).not.toContain("11:15");
  });

  it("every option is 30 minutes after the one before", () => {
    for (const list of [CHECK_TIMES.checkIn, CHECK_TIMES.checkOut]) {
      const minutes = list.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
      minutes.slice(1).forEach((m, i) => expect(m - minutes[i]).toBe(30));
    }
    expect(timeRange("09:00", "10:00")).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("a saved time outside the list stays as an extra option, in time order (never dropped)", () => {
    // Listing 44's check-in at 10:00, before the usual 12:00.
    const options = checkTimeOptions("checkIn", "10:00");
    expect(options[0]).toBe("10:00");
    expect(options.slice(1)).toEqual([...CHECK_TIMES.checkIn]);
    expect(isUnusualCheckTime("checkIn", "10:00")).toBe(true);
    // A late check-out at 13:15 sits between 13:00 and 13:30.
    const out = checkTimeOptions("checkOut", "13:15");
    expect(out.slice(out.indexOf("13:00"), out.indexOf("13:00") + 3)).toEqual(["13:00", "13:15", "13:30"]);
    // Check-out 13:00 is a usual time: nothing is added.
    expect(checkTimeOptions("checkOut", "13:00")).toEqual([...CHECK_TIMES.checkOut]);
    expect(isUnusualCheckTime("checkOut", "13:00")).toBe(false);
  });

  it("empty or malformed saved values add nothing", () => {
    expect(checkTimeOptions("checkIn", "")).toEqual([...CHECK_TIMES.checkIn]);
    expect(checkTimeOptions("checkIn", null)).toEqual([...CHECK_TIMES.checkIn]);
    expect(checkTimeOptions("checkIn", "25:00")).toEqual([...CHECK_TIMES.checkIn]);
    expect(checkTimeOptions("checkIn", FLEXIBLE_VALUE)).toEqual([...CHECK_TIMES.checkIn]);
  });
});

describe("time format per language (Western digits)", () => {
  it("24-hour in Hebrew, Russian and Georgian", () => {
    for (const locale of ["he", "ru", "ka"]) {
      expect(clockLabel("14:00", locale)).toBe("14:00");
      expect(clockLabel("22:00", locale)).toBe("22:00");
      expect(clockLabel("07:30", locale)).toMatch(/^0?7:30$/);
    }
  });

  it("12-hour in English", () => {
    expect(clockLabel("14:00", "en")).toBe("2:00 PM");
    expect(clockLabel("07:30", "en")).toBe("7:30 AM");
    expect(clockLabel("12:00", "en")).toBe("12:00 PM");
  });

  it("Arabic: its usual 12-hour form with ص / م and Western digits", () => {
    expect(clockLabel("14:00", "ar")).toBe("2:00 م");
    expect(clockLabel("07:30", "ar")).toBe("7:30 ص");
    for (const time of [...CHECK_TIMES.checkIn, ...CHECK_TIMES.checkOut]) {
      expect(clockLabel(time, "ar")).not.toMatch(/[٠-٩]/);
    }
  });

  it("older values without the leading zero read the same", () => {
    expect(normalizeClock("9:30")).toBe("09:30");
    expect(normalizeClock(" 14:00 ")).toBe("14:00");
    expect(normalizeClock("24:00")).toBeNull();
    expect(clockLabel("9:30", "en")).toBe("9:30 AM");
    expect(clockLabel("nonsense", "he")).toBe("nonsense");
  });
});

describe("the flexible choice", () => {
  it("the select value: flexible, a time, or not set", () => {
    expect(checkTimeSelectValue({ time: "", flexible: true })).toBe(FLEXIBLE_VALUE);
    // Flexible wins over a leftover time.
    expect(checkTimeSelectValue({ time: "15:00", flexible: true })).toBe(FLEXIBLE_VALUE);
    expect(checkTimeSelectValue({ time: "15:00", flexible: false })).toBe("15:00");
    expect(checkTimeSelectValue({ time: "", flexible: false })).toBe("");
  });

  it("picking flexible empties the time; picking a time turns flexible off; none clears both", () => {
    expect(checkTimeFromSelect(FLEXIBLE_VALUE)).toEqual({ time: "", flexible: true });
    expect(checkTimeFromSelect("10:00")).toEqual({ time: "10:00", flexible: false });
    expect(checkTimeFromSelect("")).toEqual({ time: "", flexible: false });
    expect(checkTimeFromSelect("garbage")).toEqual({ time: "", flexible: false });
  });

  it("readers get flexible, a time, or nothing", () => {
    expect(checkTimeDisplay(null, true)).toEqual({ flexible: true });
    expect(checkTimeDisplay("14:00", true)).toEqual({ flexible: true });
    expect(checkTimeDisplay("14:00", false)).toEqual({ flexible: false, time: "14:00" });
    expect(checkTimeDisplay("9:00", undefined)).toEqual({ flexible: false, time: "09:00" });
    expect(checkTimeDisplay(null, false)).toBeNull();
    expect(checkTimeDisplay("", null)).toBeNull();
  });
});
