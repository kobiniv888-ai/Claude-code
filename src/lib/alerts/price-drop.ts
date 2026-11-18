/**
 * The price-drop email rule (round 3, brief 7.4): "a place in one of my saved lists lowered its
 * price". Pure, unit-tested (./price-drop.test.ts); the daily run is ./price-drop-run.ts.
 *
 * Favorite.alertPrice / alertCurrency hold the place's HEADLINE price (src/lib/lists/alert-price.ts,
 * contract (2)) when it was saved, in the listing's own currency and in its deal type's one price
 * period (per night for stays; a price in another period is never watched, so a change of period
 * cannot look like a drop). Each run compares the current headline price with it:
 *
 * - **A drop:** the same currency, at least PRICE_DROP_MIN_PCT lower (conservative: a few lari
 *   off a nightly price is not news) and at most PRICE_DROP_MAX_PCT lower → ONE email, and the
 *   alert price moves down to the new price (the next email needs a new drop from there).
 * - **Smaller drops** leave the alert price where it is, so several small cuts that add up to a
 *   real one still send one email. **Rises** leave it too: the guest wants to hear when the price
 *   goes below what they saw.
 * - **A drop of more than PRICE_DROP_MAX_PCT** is most likely not a sale but a change of price
 *   period (per week → per night) or a typing mistake, so it never sends an email. Once the
 *   listing has not been edited for REBASE_AFTER_DAYS (the price is meant), the alert price
 *   moves to it silently, so later real drops are measured from there.
 * - **Another currency** (the host switched lari to dollars) cannot be compared: no email, and
 *   the alert price moves to the new price and currency silently.
 * - **No alert price** (places saved before this phase): the current price becomes the alert
 *   price silently; drops from then on send emails.
 * - **No current price:** nothing.
 */
import type { Currency } from "@/generated/prisma/enums";

/** The smallest drop that sends an email, in percent of the alert price. */
export const PRICE_DROP_MIN_PCT = 3;
/** Larger drops are treated as a changed price period or a mistake (no email). */
export const PRICE_DROP_MAX_PCT = 50;
/** A larger drop becomes the new alert price once the listing was not edited for this long. */
export const REBASE_AFTER_DAYS = 3;
/**
 * Price-drop emails per user and Israel day, across every run of the morning and every server
 * (a RateLimit row counts them, src/lib/alerts/price-drop-run.ts); more drops wait for tomorrow.
 */
export const MAX_PRICE_DROP_EMAILS_PER_DAY = 5;

const DAY_MS = 86_400_000;

export type Money = { amount: number; currency: Currency };

export type PriceDropDecision =
  /** Nothing to do (no price, a rise, a small drop, or a large one that may still be fixed). */
  | { kind: "none" }
  /** No email; store this as the new alert price. */
  | { kind: "rebase"; to: Money; reason: "no_alert_price" | "currency_changed" | "too_large" }
  /** One email, then the alert price becomes `to`. `pct` is rounded for the email. */
  | { kind: "drop"; from: Money; to: Money; pct: number };

function amountOf(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** The drop from `from` to `to` in percent (0 when not lower). */
export function dropPercent(from: number, to: number): number {
  if (!(from > 0) || !(to >= 0) || to >= from) return 0;
  return ((from - to) / from) * 100;
}

export function priceDropDecision(input: {
  alertPrice: { toString(): string } | number | null;
  alertCurrency: Currency | null;
  /** The listing's headline price now (headlineAlertPrice), or null. */
  current: Money | null;
  /** Listing.contentUpdatedAt: the last edit of the content or the price. */
  editedAt: Date;
  now: Date;
}): PriceDropDecision {
  const current = input.current && amountOf(input.current.amount) !== null ? { amount: amountOf(input.current.amount)!, currency: input.current.currency } : null;
  if (!current) return { kind: "none" };
  const saved = amountOf(input.alertPrice);
  if (saved === null || !input.alertCurrency) return { kind: "rebase", to: current, reason: "no_alert_price" };
  if (input.alertCurrency !== current.currency) return { kind: "rebase", to: current, reason: "currency_changed" };

  const pct = dropPercent(saved, current.amount);
  if (pct < PRICE_DROP_MIN_PCT) return { kind: "none" };
  if (pct > PRICE_DROP_MAX_PCT) {
    const settled = input.now.getTime() - input.editedAt.getTime() >= REBASE_AFTER_DAYS * DAY_MS;
    return settled ? { kind: "rebase", to: current, reason: "too_large" } : { kind: "none" };
  }
  return { kind: "drop", from: { amount: saved, currency: input.alertCurrency }, to: current, pct: Math.round(pct) };
}
