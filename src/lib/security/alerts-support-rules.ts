/**
 * The support reply promise, as the founder's alerts check it (founder's answer 9 of 9 November
 * 2026): "Replies within one business day, Sunday to Thursday. Messages sent Friday or Saturday are
 * answered on Sunday." Pure (no server imports): the hourly job (./alerts.ts) loads the tickets,
 * these rules say which ones are late and which of those the founder has not heard about yet.
 *
 * The rule, on the Israel calendar (Asia/Jerusalem, summer time included):
 *   - business days are Sunday to Thursday (SUPPORT_BUSINESS_WEEKDAYS);
 *   - a ticket is due SUPPORT_REPLY_BUSINESS_HOURS (24) business hours after the user's first
 *     unanswered message: only the hours of business days count. So a message on Sunday at 10:00
 *     is due on Monday at 10:00, one on Thursday at 15:00 on Sunday at 15:00, and one sent on
 *     Friday or Saturday (any hour) at the end of Sunday;
 *   - Jewish holidays that fall on a weekday are NOT skipped yet (OWNER_TODO: the founder decides).
 *
 * A ticket waits for us while it is open or in progress and the user wrote after our last public
 * reply (internal staff notes are not replies). Each late ticket alerts once per waiting spell:
 * the same ticket alerts again only after we replied and the user wrote again.
 */
import { addDays, zonedClock, zonedDayStart } from "@/lib/alerts/summary-schedule";

export const SUPPORT_TIME_ZONE = "Asia/Jerusalem";
/** 0 = Sunday … 4 = Thursday (JavaScript's getUTCDay numbering). */
export const SUPPORT_BUSINESS_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];
/** "Within one business day": 24 hours counted on business days only. */
export const SUPPORT_REPLY_BUSINESS_HOURS = 24;
/** At most this many ticket numbers are written into one alert (the count says the rest). */
export const SUPPORT_ALERT_MAX_LISTED = 10;

const HOUR_MS = 3600 * 1000;

/** The weekday (0 = Sunday) of a calendar day "YYYY-MM-DD". */
function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00.000Z`).getUTCDay();
}

export function isSupportBusinessDay(day: string): boolean {
  return SUPPORT_BUSINESS_WEEKDAYS.includes(weekdayOf(day));
}

/** When a reply to a message sent at `sentAt` is due (see the module comment). */
export function supportReplyDueAt(sentAt: Date, businessHours: number = SUPPORT_REPLY_BUSINESS_HOURS): Date {
  let left = businessHours * HOUR_MS;
  let cursor = sentAt.getTime();
  // A week holds 5 business days: 4 weeks of steps are far more than any promise needs.
  for (let step = 0; step < 40 && left > 0; step++) {
    const { day } = zonedClock(new Date(cursor), SUPPORT_TIME_ZONE);
    const dayEnd = zonedDayStart(addDays(day, 1), SUPPORT_TIME_ZONE).getTime();
    if (isSupportBusinessDay(day)) {
      const available = dayEnd - cursor;
      if (available >= left) return new Date(cursor + left);
      left -= available;
    }
    cursor = dayEnd;
  }
  return new Date(cursor);
}

/** A ticket that waits for our reply: since when (the user's first message after our last public reply). */
export type WaitingTicket = { id: string; number: number; waitingSince: Date };
export type OverdueTicket = WaitingTicket & { dueAt: Date };

/** The waiting tickets whose reply is overdue at `now`, oldest first. */
export function overdueTickets(waiting: WaitingTicket[], now: Date): OverdueTicket[] {
  return waiting
    .map((ticket) => ({ ...ticket, dueAt: supportReplyDueAt(ticket.waitingSince) }))
    .filter((ticket) => ticket.dueAt.getTime() <= now.getTime())
    .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() || a.number - b.number);
}

/** ticket id → the waitingSince (ISO) the founder was already told about. */
export type SupportAlerted = Partial<Record<string, string>>;

/** The overdue tickets the founder has not been told about for this waiting spell. */
export function newlyOverdue(overdue: OverdueTicket[], alerted: SupportAlerted): OverdueTicket[] {
  return overdue.filter((ticket) => alerted[ticket.id] !== ticket.waitingSince.toISOString());
}

/**
 * The memory after an alert went out (or not): only tickets that are still overdue are kept, so a
 * ticket that was answered drops out and alerts again when it is late again.
 */
export function nextSupportAlerted(overdue: OverdueTicket[], alerted: SupportAlerted, sent: OverdueTicket[]): SupportAlerted {
  const out: SupportAlerted = {};
  const sentIds = new Set(sent.map((ticket) => ticket.id));
  for (const ticket of overdue) {
    const since = ticket.waitingSince.toISOString();
    if (sentIds.has(ticket.id) || alerted[ticket.id] === since) out[ticket.id] = since;
  }
  return out;
}
