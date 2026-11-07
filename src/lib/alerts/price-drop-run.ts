import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { parseNotificationPrefs } from "@/lib/account/settings-schema";
import { isAccountBlocked } from "@/lib/auth/account-status";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { publicListingWhere } from "@/lib/listing/where";
import { listingCardSelect, toListingCard } from "@/lib/listing/mappers";
import { ALERT_PRICE_SELECT, headlineAlertPrice } from "@/lib/lists/alert-price";
import { emailPlace, unsubscribeHeaders, userLocale } from "@/lib/saved-searches/run";
import { savedAlertsDue } from "@/lib/saved-searches/core";
import { getSettings } from "@/lib/settings";
import { MAX_PRICE_DROP_EMAILS_PER_RUN, priceDropDecision } from "./price-drop";
import { parseAlertPrefs } from "./rules";
import { unsubscribePath } from "./unsubscribe-token";
import { isIsraelRestTime } from "./weekly-host-stats";

/**
 * The price-drop email (round 3, brief 7.4): "a place in one of your saved lists lowered its
 * price". Runs in the same cron call and morning window as the saved-search email (never on
 * Shabbat or Yom Tov), over every saved place (Favorite) of a LIVE, non-demo listing of someone
 * else, and applies ./price-drop.ts to its headline price (src/lib/lists/alert-price.ts).
 *
 * - **One email per drop:** before sending, the drop is CLAIMED by moving Favorite.alertPrice
 *   from the old price to the new one with a conditional update (only if it still holds the old
 *   price), so two runs at once cannot both send it. A failed send moves it back.
 * - Up to MAX_PRICE_DROP_EMAILS_PER_RUN emails per user and run; the rest wait (their alert price
 *   has not moved).
 * - Not for demo or blocked accounts, with the price-drop emails switched off
 *   (notificationPrefs.email.priceDrops), without an address, or to an address paused after a
 *   bounce. Silent "rebases" (a first alert price, another currency, a settled large drop) are
 *   made for everyone, so turning the emails on later compares with a sensible price.
 */

type Outcome = "sent" | "rebased" | "off" | "noEmail" | "paused" | "capped" | "already" | "failed";

export type PriceDropRunResult =
  | { status: "too_early" | "too_late" | "rest_day"; day: string }
  | ({ status: "ran"; day: string; checked: number; unfinished: boolean } & Record<Outcome, number>);

const BATCH = 200;
const TIME_BUDGET_MS = 80_000;

const userSelect = {
  id: true,
  firstName: true,
  email: true,
  contactEmail: true,
  locale: true,
  status: true,
  suspendedUntil: true,
  notificationPrefs: true,
} as const satisfies Prisma.UserSelect;

const favoriteSelect = {
  id: true,
  userId: true,
  alertPrice: true,
  alertCurrency: true,
  list: { select: { name: true, isDefault: true } },
  listing: { select: { id: true, ownerId: true, contentUpdatedAt: true, ...ALERT_PRICE_SELECT } },
  user: { select: userSelect },
} as const satisfies Prisma.FavoriteSelect;

type FavoriteRow = Prisma.FavoriteGetPayload<{ select: typeof favoriteSelect }>;

/** The list name for the email: the user's own name for it, nothing for the default list. */
function listNameOf(list: FavoriteRow["list"]): string | null {
  if (!list || list.isDefault) return null;
  return list.name.trim() || null;
}

async function sendDrop(
  favorite: FavoriteRow,
  decision: Extract<ReturnType<typeof priceDropDecision>, { kind: "drop" }>,
  now: Date,
  pledgeRequiredVersion: number,
): Promise<Outcome> {
  const user = favorite.user;
  if (!parseNotificationPrefs(user.notificationPrefs).email.priceDrops) return "off";
  const to = notificationEmailFor(user);
  if (!to) return "noEmail";
  const failing = parseAlertPrefs(user.notificationPrefs).email.failing;
  if (failing && failing.address === to.trim().toLowerCase()) return "paused";

  // The claim: the alert price moves to the new price only if it still holds the old one.
  const claimed = await db.favorite.updateMany({
    where: { id: favorite.id, alertPrice: favorite.alertPrice, alertCurrency: favorite.alertCurrency },
    data: { alertPrice: decision.to.amount },
  });
  if (claimed.count !== 1) return "already";
  const undo = () =>
    db.favorite
      .updateMany({ where: { id: favorite.id, alertPrice: decision.to.amount }, data: { alertPrice: favorite.alertPrice } })
      .catch((error: unknown) => console.error(`[price-drop] could not restore the alert price of ${favorite.id}:`, error));

  try {
    const locale = userLocale(user.locale);
    const row = await db.listing.findUnique({ where: { id: favorite.listing.id }, select: listingCardSelect(locale) });
    if (!row) {
      await undo();
      return "failed";
    }
    const card = toListingCard(row, { locale, now, featuredIds: new Set(), favoriteIds: new Set(), pledgeRequiredVersion });
    const result = await sendEmail({
      to,
      template: "price_drop",
      locale,
      data: {
        name: user.firstName?.trim() || null,
        place: emailPlace(card),
        oldPrice: decision.from.amount,
        newPrice: decision.to.amount,
        pct: decision.pct,
        listName: listNameOf(favorite.list),
        manageUrl: "/account/alerts",
        unsubscribeUrl: unsubscribePath(user.id, "price_drop"),
      },
      headers: unsubscribeHeaders(user.id, "price_drop"),
    });
    if (!result.ok) {
      await undo();
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error(`[price-drop] favorite ${favorite.id} failed:`, error);
    await undo();
    return "failed";
  }
}

/** Stores a new alert price without an email (only if the row still holds what was read). */
async function rebase(favorite: FavoriteRow, to: { amount: number; currency: FavoriteRow["alertCurrency"] & string }): Promise<boolean> {
  const { count } = await db.favorite.updateMany({
    where: { id: favorite.id, alertPrice: favorite.alertPrice, alertCurrency: favorite.alertCurrency },
    data: { alertPrice: to.amount, alertCurrency: to.currency },
  });
  return count === 1;
}

/**
 * One run. `onlyUserId` limits it to one user's saved places (the end-to-end test, through the
 * cron route in development / test mode only).
 */
export async function runPriceDropAlerts(
  now: Date = new Date(),
  opts: { isRestTime?: (at: Date) => boolean; onlyUserId?: string | null; timeBudgetMs?: number } = {},
): Promise<PriceDropRunResult> {
  const due = savedAlertsDue(now, opts.isRestTime ?? isIsraelRestTime);
  if (!due.send) return { status: due.reason, day: due.day };

  const { pledgeRequiredVersion } = await getSettings();
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? TIME_BUDGET_MS;
  const counts: Record<Outcome, number> = { sent: 0, rebased: 0, off: 0, noEmail: 0, paused: 0, capped: 0, already: 0, failed: 0 };
  const sentPerUser = new Map<string, number>();
  let checked = 0;
  let unfinished = false;
  let cursor: string | undefined;
  for (;;) {
    const batch: FavoriteRow[] = await db.favorite.findMany({
      where: {
        ...(opts.onlyUserId ? { userId: opts.onlyUserId } : {}),
        user: { isDemo: false, status: { in: ["ACTIVE", "WARNED"] } },
        // Public now, never a demo listing (whatever the demo setting says).
        listing: publicListingWhere({ demoVisible: false, now }),
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: favoriteSelect,
    });
    for (const favorite of batch) {
      if (Date.now() - started > budget) {
        unfinished = true;
        break;
      }
      // Never about the user's own place.
      if (favorite.listing.ownerId === favorite.userId || isAccountBlocked(favorite.user, now)) continue;
      checked += 1;
      const decision = priceDropDecision({
        alertPrice: favorite.alertPrice,
        alertCurrency: favorite.alertCurrency,
        current: headlineAlertPrice(favorite.listing),
        editedAt: favorite.listing.contentUpdatedAt,
        now,
      });
      try {
        if (decision.kind === "rebase") {
          if (await rebase(favorite, decision.to)) counts.rebased += 1;
        } else if (decision.kind === "drop") {
          const sent = sentPerUser.get(favorite.userId) ?? 0;
          if (sent >= MAX_PRICE_DROP_EMAILS_PER_RUN) {
            counts.capped += 1;
            continue;
          }
          const outcome = await sendDrop(favorite, decision, now, pledgeRequiredVersion);
          if (outcome === "sent") sentPerUser.set(favorite.userId, sent + 1);
          counts[outcome] += 1;
        }
      } catch (error) {
        console.error(`[price-drop] favorite ${favorite.id} failed:`, error);
        counts.failed += 1;
      }
    }
    if (unfinished || batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return { status: "ran", day: due.day, checked, ...counts, unfinished };
}
