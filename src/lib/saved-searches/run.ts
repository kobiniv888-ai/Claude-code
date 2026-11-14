import "server-only";
import { siteConfig, type AppLocale } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { isAppLocale } from "@/i18n/locale";
import { parseNotificationPrefs } from "@/lib/account/settings-schema";
import { parseAlertPrefs } from "@/lib/alerts/rules";
import { unsubscribePath, unsubscribeToken, type UnsubscribeKind } from "@/lib/alerts/unsubscribe-token";
import { isIsraelRestTime } from "@/lib/alerts/weekly-host-stats";
import { isAccountBlocked } from "@/lib/auth/account-status";
import { tbilisiToday } from "@/lib/booking/dates";
import { getRates } from "@/lib/currency";
import type { Rates } from "@/lib/currency/convert";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { listingCardSelect, toListingCard } from "@/lib/listing/mappers";
import { searchWhere } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";
import {
  MAX_CANDIDATES_PER_SEARCH,
  buildDigest,
  dailyClaimKey,
  datesPassed,
  matchWindowStart,
  mergeMatchIds,
  newMatches,
  readStoredFilters,
  savedAlertsDue,
  savedSearchPath,
} from "./core";
import type { AlertEmailPlace, SavedAlertEmailData } from "./email-templates";

/**
 * The daily saved-search email (round 3, brief 7.4), called by GET /api/cron/saved-alerts
 * (CRON_SECRET) a few times each morning. Outside 08:00–11:59 Israel time, and on Shabbat or
 * Yom Tov, a call does nothing (./core.ts savedAlertsDue, the founder's summary window).
 *
 * For each user with an active saved search:
 * - not for demo accounts, blocked accounts, or addresses paused after a bounce or a complaint;
 *   with the saved-search emails switched off (User.notificationPrefs.email.savedSearches) or no
 *   address to write to, the searches are only marked as checked (turning the emails back on
 *   later never sends a backlog);
 * - each search is matched with the search page's own where-builder (searchWhere, with the
 *   currency it was saved in and today's rates), so it finds exactly what the user would see
 *   there, plus: first published in the search's window (./core.ts matchWindowStart), not the
 *   user's own and never a demo listing, whatever the demo setting;
 * - places already sent for that search (lastMatchIds) are left out;
 * - at most ONE email a day per user groups all of their searches: the user is CLAIMED first with
 *   a RateLimit row "saved-search-alerts:<Israel day>:<user id>" (INSERT … ON CONFLICT DO
 *   NOTHING), so two servers running at once cannot both send. A run that finds nothing new does
 *   not claim the day (a later run that morning may still send). A failed send releases the
 *   claim and changes nothing else. Once the email went out the claim is settled at once and is
 *   never released, whatever fails afterwards (lists-alerts-4). A pending claim older than
 *   STALE_CLAIM_MINUTES (its run died) is taken over by the next run, unless the outbox shows the
 *   email went out after it was claimed: then the claim is settled and the searches remember the
 *   places that email had (published by the time of the claim), so tomorrow does not repeat them
 *   (lists-alerts-8).
 * - After the email: every shown search remembers its places and the time (lastSentAt,
 *   lastMatchIds, lastCheckedAt); searches left out of a long email keep their window for the
 *   next one. A search deleted meanwhile is skipped (updateMany), never aborting the others.
 * Emails go through @/lib/email (the admin outbox until Resend is set up), in the user's language,
 * with a signed one-tap unsubscribe link and List-Unsubscribe headers.
 */

export const STALE_CLAIM_MINUTES = 5;
const PENDING = 0;
const SENT = 1;
const CLAIM_MS = 2 * 24 * 3600 * 1000;
const BATCH = 100;
/** The cron route has 300 s; stop starting new users after this, the next run goes on. */
const TIME_BUDGET_MS = 200_000;

type UserOutcome = "sent" | "quiet" | "off" | "noEmail" | "paused" | "already" | "failed";

export type SavedSearchRunResult =
  | { status: "too_early" | "too_late" | "rest_day"; day: string }
  | ({ status: "ran"; day: string; users: number; unfinished: boolean } & Record<UserOutcome, number>);

/** RFC 8058 one-click unsubscribe headers for a bulk email kind (POST lands on /api/unsubscribe). */
export function unsubscribeHeaders(userId: string, kind: UnsubscribeKind): Record<string, string> {
  const url = `${siteUrl()}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, kind))}`;
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** A card as the email shows it. */
export function emailPlace(card: ListingCardData): AlertEmailPlace {
  const place = card.neighborhoodName && card.cityName ? `${card.neighborhoodName}, ${card.cityName}` : card.cityName;
  return {
    title: card.title,
    publicId: card.publicId,
    url: card.href,
    place,
    price: card.price,
    currency: card.currency,
    pricePeriod: card.pricePeriod,
    priceIsFrom: card.priceIsFrom,
  };
}

export function userLocale(value: string): AppLocale {
  return isAppLocale(value) ? value : siteConfig.i18n.primaryLocale;
}

// ─── The once-a-day claim ─────────────────────────────────────

/** "claimed": this run sends; "busy": another run has the day; `{ sentAt }`: a dead run's email went out then. */
type Claim = "claimed" | "busy" | { sentAt: Date };

const staleMs = () => STALE_CLAIM_MINUTES * 60_000;

async function claimUser(day: string, userId: string, now: Date, to: string): Promise<Claim> {
  const key = dailyClaimKey(day, userId);
  const resetAt = new Date(now.getTime() + CLAIM_MS);
  const { count } = await db.rateLimit.createMany({ data: [{ key, count: PENDING, resetAt }], skipDuplicates: true });
  if (count === 1) return "claimed";
  const claim = await db.rateLimit.findUnique({ where: { key }, select: { count: true, resetAt: true } });
  const staleBefore = new Date(resetAt.getTime() - staleMs());
  if (!claim || claim.count !== PENDING || claim.resetAt >= staleBefore) return "busy";
  // A stale pending claim: the run that took it may have sent the email and then died. The
  // outbox says whether the day's email went out since it was claimed.
  const claimedAt = new Date(claim.resetAt.getTime() - CLAIM_MS);
  const sent = await db.emailOutbox.findFirst({
    where: { template: "saved_search_matches", to: { equals: to.trim(), mode: "insensitive" }, status: { in: ["SENT", "LOGGED", "QUEUED"] }, createdAt: { gte: claimedAt } },
    select: { id: true },
  });
  if (sent) {
    const settled = await db.rateLimit.updateMany({ where: { key, count: PENDING, resetAt: claim.resetAt }, data: { count: SENT } });
    return settled.count === 1 ? { sentAt: claimedAt } : "busy";
  }
  const taken = await db.rateLimit.updateMany({ where: { key, count: PENDING, resetAt: claim.resetAt }, data: { resetAt } });
  return taken.count === 1 ? "claimed" : "busy";
}

/**
 * Whether today's email is settled or being sent right now (a fresh pending claim). A stale
 * pending claim does not count: its run died, and claimUser decides whether to take it over.
 */
async function hasLiveClaim(day: string, userId: string, now: Date): Promise<boolean> {
  const claim = await db.rateLimit.findUnique({ where: { key: dailyClaimKey(day, userId) }, select: { count: true, resetAt: true } });
  if (!claim) return false;
  if (claim.count !== PENDING) return true;
  return claim.resetAt.getTime() >= now.getTime() + CLAIM_MS - staleMs();
}

async function settleClaim(day: string, userId: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await db.rateLimit.updateMany({ where: { key: dailyClaimKey(day, userId) }, data: { count: SENT } });
      return;
    } catch (error) {
      if (attempt === 3) console.error(`[saved-searches] could not settle the claim of ${userId}:`, error);
    }
  }
}

async function releaseClaim(day: string, userId: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key: dailyClaimKey(day, userId) } }).catch(() => undefined);
}

// ─── Matching ─────────────────────────────────────────────────

type SearchRow = { id: string; name: string; filters: Prisma.JsonValue; createdAt: Date; lastCheckedAt: Date | null; lastMatchIds: string[] };

type Context = { now: Date; today: string; rates: Rates; pledgeRequiredVersion: number };

/** The new places of one saved search for this user (in the user's language), newest first. */
export async function newPlacesFor(search: SearchRow, user: { id: string; locale: AppLocale }, ctx: Context): Promise<ListingCardData[]> {
  const criteria = readStoredFilters(search.filters);
  if (!criteria || datesPassed(criteria.filters, ctx.today)) return [];
  const since = matchWindowStart(search, ctx.now);
  // The search page's own where (LIVE, not expired, active owner, every filter), never demo rows.
  const where = await searchWhere(criteria.filters, { currency: criteria.currency, rates: ctx.rates }, { demoVisible: false, now: ctx.now });
  const rows = await db.listing.findMany({
    where: { AND: [where, { isDemo: false, ownerId: { not: user.id }, publishedAt: { gt: since, lte: ctx.now } }] },
    orderBy: [{ publishedAt: "desc" }, { publicId: "desc" }],
    take: MAX_CANDIDATES_PER_SEARCH,
    select: listingCardSelect(user.locale),
  });
  const cards = rows.map((row) =>
    toListingCard(row, { locale: user.locale, now: ctx.now, featuredIds: new Set(), favoriteIds: new Set(), pledgeRequiredVersion: ctx.pledgeRequiredVersion }),
  );
  return newMatches(cards, search.lastMatchIds);
}

async function markChecked(searchIds: string[], now: Date): Promise<void> {
  if (searchIds.length) await db.savedSearch.updateMany({ where: { id: { in: searchIds } }, data: { lastCheckedAt: now } });
}

type Found = { search: SearchRow; matches: ListingCardData[] };

/**
 * After an email that went out at `sentAt`: the shown searches remember every new place (the
 * email links to all of them through the search) and the time; searches with nothing new are
 * checked; the ones left out keep their window. Each row is its own updateMany (scoped to the
 * user), so a search deleted while the email was being sent is skipped instead of failing the
 * others. Retried; never throws (the email is out, the claim is settled).
 */
async function recordSent(userId: string, found: readonly Found[], shownIds: ReadonlySet<string>, sentAt: Date): Promise<void> {
  const updates = found.flatMap(({ search, matches }) => {
    const where = { id: search.id, userId };
    if (shownIds.has(search.id)) {
      return [db.savedSearch.updateMany({ where, data: { lastSentAt: sentAt, lastCheckedAt: sentAt, lastMatchIds: mergeMatchIds(search.lastMatchIds, matches.map((m) => m.id)) } })];
    }
    return matches.length === 0 ? [db.savedSearch.updateMany({ where, data: { lastCheckedAt: sentAt } })] : [];
  });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await db.$transaction(updates);
      return;
    } catch (error) {
      if (attempt === 3) console.error(`[saved-searches] user ${userId}: the email went out but the searches were not updated:`, error);
    }
  }
}

function digestOf(found: readonly Found[]) {
  return buildDigest(found.map(({ search, matches }) => ({ id: search.id, name: search.name, query: readStoredFilters(search.filters)?.query ?? "", matches })));
}

/** The places a dead run's email had: the ones published by the time it claimed the day. */
function foundBy(found: readonly Found[], at: Date): Found[] {
  return found.map(({ search, matches }) => ({
    search,
    matches: matches.filter((m) => m.publishedAt !== null && new Date(m.publishedAt).getTime() <= at.getTime()),
  }));
}

// ─── One user ─────────────────────────────────────────────────

const userSelect = {
  id: true,
  name: true,
  firstName: true,
  email: true,
  contactEmail: true,
  locale: true,
  status: true,
  suspendedUntil: true,
  notificationPrefs: true,
  isDemo: true,
} as const satisfies Prisma.UserSelect;

type User = Prisma.UserGetPayload<{ select: typeof userSelect }>;

async function runForUser(user: User, day: string, ctx: Context): Promise<UserOutcome> {
  const searches: SearchRow[] = await db.savedSearch.findMany({
    where: { userId: user.id, active: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, filters: true, createdAt: true, lastCheckedAt: true, lastMatchIds: true },
  });
  if (searches.length === 0) return "quiet";
  const ids = searches.map((s) => s.id);

  // Switched off or nowhere to write: checked, so turning the emails back on sends no backlog.
  if (!parseNotificationPrefs(user.notificationPrefs).email.savedSearches) {
    await markChecked(ids, ctx.now);
    return "off";
  }
  const to = notificationEmailFor(user);
  if (!to) {
    await markChecked(ids, ctx.now);
    return "noEmail";
  }
  // An address that bounced or complained is paused for every email of the site.
  const failing = parseAlertPrefs(user.notificationPrefs).email.failing;
  if (failing && failing.address === to.trim().toLowerCase()) {
    await markChecked(ids, ctx.now);
    return "paused";
  }
  // Already emailed today (or being emailed right now): nothing changes, the places wait for
  // tomorrow's email.
  if (await hasLiveClaim(day, user.id, ctx.now)) return "already";

  const locale = userLocale(user.locale);
  const found: Found[] = [];
  for (const search of searches) found.push({ search, matches: await newPlacesFor(search, { id: user.id, locale }, ctx) });
  const digest = digestOf(found);
  if (digest.shown.length === 0) {
    await markChecked(ids, ctx.now);
    return "quiet";
  }
  const claim = await claimUser(day, user.id, ctx.now, to);
  if (claim === "busy") return "already";
  if (claim !== "claimed") {
    // A dead run's email went out: remember what it had, so tomorrow does not repeat it.
    const earlier = foundBy(found, claim.sentAt);
    await recordSent(user.id, earlier, new Set(digestOf(earlier).shown.map((s) => s.id)), claim.sentAt);
    return "already";
  }

  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    const data: SavedAlertEmailData["saved_search_matches"] = {
      name: user.firstName?.trim() || null,
      searches: digest.shown.map((search) => ({
        name: search.name,
        url: savedSearchPath(search.query),
        places: search.matches.map(emailPlace),
        more: search.more,
        total: search.total,
      })),
      moreSearches: digest.moreSearches,
      totalPlaces: digest.totalPlaces,
      manageUrl: "/account/alerts",
      unsubscribeUrl: unsubscribePath(user.id, "saved_search"),
    };
    result = await sendEmail({ to, template: "saved_search_matches", locale, data, headers: unsubscribeHeaders(user.id, "saved_search") });
  } catch (error) {
    console.error(`[saved-searches] user ${user.id} failed:`, error);
    await releaseClaim(day, user.id);
    return "failed";
  }
  if (!result.ok) {
    await releaseClaim(day, user.id);
    return "failed";
  }
  // The email is out: the day is settled first and never released, whatever fails afterwards.
  await settleClaim(day, user.id);
  await recordSent(user.id, found, new Set(digest.shown.map((s) => s.id)), ctx.now);
  return "sent";
}

/**
 * One run. `onlyUserId` limits it to one user (the end-to-end test, through the cron route in
 * development / test mode only).
 */
export async function runSavedSearchAlerts(
  now: Date = new Date(),
  opts: { isRestTime?: (at: Date) => boolean; onlyUserId?: string | null; timeBudgetMs?: number } = {},
): Promise<SavedSearchRunResult> {
  const decision = savedAlertsDue(now, opts.isRestTime ?? isIsraelRestTime);
  if (!decision.send) return { status: decision.reason, day: decision.day };

  const [rates, settings] = await Promise.all([getRates(), getSettings()]);
  const ctx: Context = { now, today: tbilisiToday(now), rates, pledgeRequiredVersion: settings.pledgeRequiredVersion };
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? TIME_BUDGET_MS;
  const counts: Record<UserOutcome, number> = { sent: 0, quiet: 0, off: 0, noEmail: 0, paused: 0, already: 0, failed: 0 };
  let users = 0;
  let unfinished = false;
  let cursor: string | undefined;
  for (;;) {
    const batch: User[] = await db.user.findMany({
      where: {
        ...(opts.onlyUserId ? { id: opts.onlyUserId } : {}),
        isDemo: false,
        status: { in: ["ACTIVE", "WARNED"] },
        savedSearches: { some: { active: true } },
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: userSelect,
    });
    for (const user of batch) {
      if (Date.now() - started > budget) {
        unfinished = true;
        break;
      }
      if (isAccountBlocked(user, now)) continue;
      users += 1;
      try {
        counts[await runForUser(user, decision.day, ctx)] += 1;
      } catch (error) {
        console.error(`[saved-searches] user ${user.id} failed:`, error);
        counts.failed += 1;
      }
    }
    if (unfinished || batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return { status: "ran", day: decision.day, users, ...counts, unfinished };
}
