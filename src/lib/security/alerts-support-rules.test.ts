/**
 * The support reply promise (founder's answer 9 of 9 November 2026): "Replies within one business
 * day, Sunday to Thursday. Messages sent Friday or Saturday are answered on Sunday." Business days
 * on the Israel calendar, summer and winter time; each late ticket alerts once per waiting spell.
 */
import { describe, expect, it } from "vitest";
import {
  newlyOverdue,
  nextSupportAlerted,
  overdueTickets,
  supportReplyDueAt,
  isSupportBusinessDay,
} from "./alerts-support-rules";

/** An Israel wall-clock time ("2026-11-08T10:00") in winter (UTC+2) as a Date. */
const il = (local: string, offset = "+02:00") => new Date(`${local}:00${offset}`);

describe("business days: Sunday to Thursday", () => {
  it("knows the week (8 Nov 2026 is a Sunday)", () => {
    expect(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"].every(isSupportBusinessDay)).toBe(true);
    expect(isSupportBusinessDay("2026-11-13")).toBe(false); // Friday
    expect(isSupportBusinessDay("2026-11-14")).toBe(false); // Saturday
  });
});

describe("supportReplyDueAt: 24 business hours", () => {
  it("Sunday 10:00 → Monday 10:00", () => {
    expect(supportReplyDueAt(il("2026-11-08T10:00")).toISOString()).toBe(il("2026-11-09T10:00").toISOString());
  });

  it("Thursday 15:00 → Sunday 15:00 (Friday and Saturday do not count)", () => {
    expect(supportReplyDueAt(il("2026-11-12T15:00")).toISOString()).toBe(il("2026-11-15T15:00").toISOString());
  });

  it("Friday or Saturday, any hour → the end of Sunday", () => {
    const endOfSunday = il("2026-11-16T00:00").toISOString();
    for (const sent of ["2026-11-13T00:30", "2026-11-13T09:00", "2026-11-14T23:50"]) {
      expect(supportReplyDueAt(il(sent)).toISOString()).toBe(endOfSunday);
    }
  });

  it("Thursday just before midnight → Sunday just before midnight", () => {
    expect(supportReplyDueAt(il("2026-11-12T23:59")).toISOString()).toBe(il("2026-11-15T23:59").toISOString());
  });

  it("uses Israel time in summer too (UTC+3)", () => {
    // 2026-06-14 is a Sunday, Israel summer time.
    expect(supportReplyDueAt(il("2026-06-14T09:00", "+03:00")).toISOString()).toBe(il("2026-06-15T09:00", "+03:00").toISOString());
    // Friday 2026-06-19 → end of Sunday 2026-06-21.
    expect(supportReplyDueAt(il("2026-06-19T12:00", "+03:00")).toISOString()).toBe(il("2026-06-22T00:00", "+03:00").toISOString());
  });

  it("across the clock change (Israel leaves summer time on Sunday 25 Oct 2026): real hours count", () => {
    // Thursday 22 Oct 15:00 (UTC+3): 9 hours that Thursday, then 15 of Sunday's 25 hours → 14:00 (UTC+2).
    expect(supportReplyDueAt(il("2026-10-22T15:00", "+03:00")).toISOString()).toBe(il("2026-10-25T14:00", "+02:00").toISOString());
  });
});

describe("overdue tickets: once per waiting spell", () => {
  const sunday = il("2026-11-08T10:00");
  const tickets = [
    { id: "t1", number: 12, waitingSince: sunday },
    { id: "t2", number: 15, waitingSince: il("2026-11-09T09:00") },
  ];

  it("only tickets past their due time, oldest first", () => {
    expect(overdueTickets(tickets, il("2026-11-09T09:59")).map((t) => t.number)).toEqual([]);
    expect(overdueTickets(tickets, il("2026-11-09T10:00")).map((t) => t.number)).toEqual([12]);
    expect(overdueTickets(tickets, il("2026-11-10T12:00")).map((t) => t.number)).toEqual([12, 15]);
  });

  it("a ticket the founder heard about does not alert again; a new waiting spell does", () => {
    const now = il("2026-11-10T12:00");
    const overdue = overdueTickets(tickets, now);
    const first = newlyOverdue(overdue, {});
    expect(first.map((t) => t.number)).toEqual([12, 15]);
    const memory = nextSupportAlerted(overdue, {}, first);
    expect(newlyOverdue(overdue, memory)).toEqual([]);

    // We answered #12 (it is no longer waiting): it leaves the memory…
    const afterReply = overdueTickets([tickets[1]!], now);
    const memory2 = nextSupportAlerted(afterReply, memory, []);
    expect(Object.keys(memory2)).toEqual(["t2"]);
    // …and the user's next unanswered message, once late, alerts again.
    const again = overdueTickets([{ id: "t1", number: 12, waitingSince: il("2026-11-10T12:30") }, tickets[1]!], il("2026-11-11T13:00"));
    expect(newlyOverdue(again, memory2).map((t) => t.number)).toEqual([12]);
  });

  it("a ticket that was not delivered stays new for the next run", () => {
    const overdue = overdueTickets(tickets, il("2026-11-10T12:00"));
    const memory = nextSupportAlerted(overdue, {}, []);
    expect(newlyOverdue(overdue, memory).map((t) => t.number)).toEqual([12, 15]);
  });
});
