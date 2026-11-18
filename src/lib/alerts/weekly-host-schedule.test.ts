import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyDue, weeklyDueDay, weeklyMoment, weeklyPeriod, weekSunday } from "./weekly-host-schedule";

const never = () => false;

describe("weekly host email schedule", () => {
  it("finds the week's Sunday", () => {
    expect(weekSunday("2026-11-08")).toBe("2026-11-08"); // a Sunday
    expect(weekSunday("2026-11-09")).toBe("2026-11-08");
    expect(weekSunday("2026-11-14")).toBe("2026-11-08"); // Saturday
  });

  it("covers the Sunday to Saturday before, even when sent on Monday", () => {
    expect(weeklyPeriod("2026-11-08")).toEqual({ fromDay: "2026-11-01", toDay: "2026-11-07" });
  });

  it("09:00 Israel time is 07:00 UTC in winter and 06:00 UTC in summer", () => {
    expect(weeklyMoment("2026-11-08").toISOString()).toBe("2026-11-08T07:00:00.000Z");
    expect(weeklyMoment("2026-06-07").toISOString()).toBe("2026-06-07T06:00:00.000Z");
  });

  it("sends on Sunday between 09:00 and 11:59 Israel time only", () => {
    // Sunday 8 Nov 2026, Israel is UTC+2.
    expect(weeklyDue(new Date("2026-11-08T06:30:00Z"), never)).toMatchObject({ send: false, reason: "too_early" }); // 08:30
    expect(weeklyDue(new Date("2026-11-08T07:00:00Z"), never)).toEqual({
      send: true,
      week: "2026-11-08",
      day: "2026-11-08",
      fromDay: "2026-11-01",
      toDay: "2026-11-07",
    });
    expect(weeklyDue(new Date("2026-11-08T09:59:00Z"), never)).toMatchObject({ send: true }); // 11:59
    expect(weeklyDue(new Date("2026-11-08T10:00:00Z"), never)).toMatchObject({ send: false, reason: "too_late" }); // 12:00
    // Summer: UTC+3.
    expect(weeklyDue(new Date("2026-06-07T06:05:00Z"), never)).toMatchObject({ send: true, week: "2026-06-07" }); // 09:05
  });

  it("never sends on another day of the week", () => {
    for (const at of ["2026-11-09T08:00:00Z", "2026-11-10T08:00:00Z", "2026-11-13T08:00:00Z", "2026-11-14T08:00:00Z"]) {
      expect(weeklyDue(new Date(at), never), at).toMatchObject({ send: false, reason: "not_due_day" });
    }
  });

  it("a Yom Tov Sunday skips and sends on Monday (Tuesday after a two-day Yom Tov)", () => {
    const sundayHoliday = (at: Date) => at.toISOString().startsWith("2026-11-08");
    expect(weeklyDueDay("2026-11-08", sundayHoliday)).toBe("2026-11-09");
    expect(weeklyDue(new Date("2026-11-08T07:30:00Z"), sundayHoliday)).toMatchObject({ send: false, reason: "not_due_day" });
    expect(weeklyDue(new Date("2026-11-09T07:30:00Z"), sundayHoliday)).toEqual({
      send: true,
      week: "2026-11-08",
      day: "2026-11-09",
      fromDay: "2026-11-01",
      toDay: "2026-11-07",
    });
    const twoDays = (at: Date) => at.toISOString() < "2026-11-10";
    expect(weeklyDueDay("2026-11-08", twoDays)).toBe("2026-11-10");
    const allWeek = () => true;
    expect(weeklyDueDay("2026-11-08", allWeek)).toBeNull();
    expect(weeklyDue(new Date("2026-11-08T07:30:00Z"), allWeek)).toMatchObject({ send: false });
  });

  it("never sends while it is Shabbat or Yom Tov right now", () => {
    let calls = 0;
    // Free at 09:00, but a rest time at the moment of the run (a defensive check).
    const restNow = (at: Date) => (calls++ === 0 ? false : at.getUTCHours() >= 8);
    expect(weeklyDue(new Date("2026-11-08T08:30:00Z"), restNow)).toMatchObject({ send: false, reason: "rest_day" });
  });
});

describe("the weekly email's cron schedule (vercel.json)", () => {
  it("runs on Sunday to Tuesday, with at least two tries inside 09:00–11:59 Israel time in winter and summer", () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    const entry = config.crons.find((c) => c.path === "/api/cron/weekly-host-stats");
    expect(entry).toBeTruthy();
    const [minute, hours, , , weekdays] = entry!.schedule.split(" ");
    expect(weekdays).toBe("0-2");
    const [from, to] = hours.split("-").map(Number);
    for (const day of ["2026-11-08", "2026-06-07"]) {
      const sends = Array.from({ length: to - from + 1 }, (_, i) => new Date(`${day}T${String(from + i).padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`)).filter(
        (at) => weeklyDue(at, never).send,
      );
      expect(sends.length, day).toBeGreaterThanOrEqual(2);
    }
  });
});
