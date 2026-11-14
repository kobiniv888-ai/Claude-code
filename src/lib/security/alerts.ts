import "server-only";
import tls from "node:tls";
import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { isAppLocale } from "@/i18n/locale";
import { readOffsiteConfig } from "@/lib/admin/maintenance/offsite-config";
import { sendFounderEmail } from "@/lib/alerts/founder-admin";
import { sendTelegramMessage } from "@/lib/alerts/telegram";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { isProductionSite } from "@/lib/site-env";
import { securityAlertTelegramText } from "./alerts-email-template";
import {
  SECURITY_ALERT_WINDOW_MINUTES,
  dueAlerts,
  evaluateSecurityAlerts,
  type SecurityAlert,
  type SecuritySignals,
} from "./alerts-rules";
import { newlyOverdue, nextSupportAlerted, overdueTickets, type SupportAlerted, type WaitingTicket } from "./alerts-support-rules";

/**
 * The founder's security alerts (SECURITY_REPORT 16.3, 4.7.a, 3.8.c), run hourly by
 * /api/cron/security-alerts: counts from the security event log (src/lib/security/events.ts), the
 * audit log and the new accounts / listings / bookings of the last hour, judged by ./alerts-rules.ts,
 * then ONE message by email (sendFounderEmail: ADMIN_ALERT_EMAIL, else the admin accounts) and by
 * Telegram (ADMIN_ALERT_TELEGRAM_CHAT_ID, else the admin accounts that connected the bot). The same
 * kind alerts at most once an hour (daily for the certificate and a missing off-site backup).
 *
 * Also the support reply promise (founder's answer 9): a ticket still waiting for our reply after
 * one business day (./alerts-support-rules.ts) alerts once per waiting spell.
 *
 * Its state (last run, last time each kind was sent, the daily certificate check, the late tickets
 * already reported) is the SiteSetting "securityAlertsState". Counts only: no names, addresses,
 * phones, IPs or ids leave (late tickets: their running number only).
 */

export const SECURITY_ALERTS_STATE_KEY = "securityAlertsState";

export type SecurityAlertsState = {
  lastRunAt?: string;
  lastSent?: Partial<Record<string, string>>;
  certCheckedAt?: string;
  certDaysLeft?: number | null;
  /** Late support tickets already reported: ticket id → its waitingSince (ISO). */
  supportAlerted?: SupportAlerted;
};

/** The event types whose count from one IP hash matters (ID guessing, password-spray style bursts). */
const PER_IP_TYPES = ["login_failed", "permission_denied", "id_not_found"] as const;
/** At most this far back when the last run is long ago (a cron that stopped for a while). */
const MAX_WINDOW_MS = 3 * 3600 * 1000;

function parseState(value: unknown): SecurityAlertsState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as SecurityAlertsState;
  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : undefined,
    lastSent: raw.lastSent && typeof raw.lastSent === "object" ? raw.lastSent : {},
    certCheckedAt: typeof raw.certCheckedAt === "string" ? raw.certCheckedAt : undefined,
    certDaysLeft: typeof raw.certDaysLeft === "number" ? raw.certDaysLeft : null,
    supportAlerted:
      raw.supportAlerted && typeof raw.supportAlerted === "object" && !Array.isArray(raw.supportAlerted)
        ? Object.fromEntries(Object.entries(raw.supportAlerted).filter(([, v]) => typeof v === "string"))
        : {},
  };
}

async function readState(): Promise<SecurityAlertsState> {
  const row = await db.siteSetting.findUnique({ where: { key: SECURITY_ALERTS_STATE_KEY }, select: { value: true } });
  return parseState(row?.value);
}

async function writeState(state: SecurityAlertsState): Promise<void> {
  const value = state as unknown as Prisma.InputJsonValue;
  await db.siteSetting.upsert({ where: { key: SECURITY_ALERTS_STATE_KEY }, create: { key: SECURITY_ALERTS_STATE_KEY, value }, update: { value } });
}

/** The start of this run's window: the last run (when recent), at least an hour back. */
export function windowStart(now: Date, lastRunAt: string | undefined): Date {
  const hourAgo = new Date(now.getTime() - SECURITY_ALERT_WINDOW_MINUTES * 60_000);
  const last = lastRunAt ? new Date(lastRunAt) : null;
  if (!last || Number.isNaN(last.getTime()) || now.getTime() - last.getTime() > MAX_WINDOW_MS) return hourAgo;
  return last < hourAgo ? last : hourAgo;
}

/** Everything the rules look at, for the window [since, now]. */
export async function collectSecuritySignals(since: Date, now: Date, opts: { certificateDaysLeft?: number | null } = {}): Promise<SecuritySignals> {
  const window = { gte: since, lte: now };
  const [byType, perIp, staffNewDevices, staffSecurityChanges, maintenanceOn, maintenanceOff, roleChanges, signupsSite, signupsPerIp, listingsCreated, bookingsCreated, lastOk] =
    await Promise.all([
      db.securityEvent.groupBy({ by: ["type"], where: { createdAt: window }, _count: { _all: true } }),
      db.$queryRaw<{ type: string; max: number }[]>`
        SELECT type, MAX(n)::int AS max FROM (
          SELECT type, "ipHash", COUNT(*)::int AS n FROM "SecurityEvent"
          WHERE "createdAt" >= ${since} AND "createdAt" <= ${now} AND "ipHash" IS NOT NULL AND type = ANY(${[...PER_IP_TYPES]})
          GROUP BY type, "ipHash"
        ) per_ip GROUP BY type`,
      db.securityEvent.count({ where: { type: "new_device_login", createdAt: window, meta: { path: ["staff"], equals: true } } }),
      // A staff account's own security changes; a listing's contact details are not one.
      db.securityEvent.count({
        where: {
          type: "sensitive_change",
          createdAt: window,
          user: { role: { in: [...STAFF_ROLES] } },
          NOT: { meta: { path: ["kind"], equals: "listing_contact" } },
        },
      }),
      db.securityEvent.count({ where: { type: "maintenance_mode_changed", createdAt: window, meta: { path: ["on"], equals: true } } }),
      db.securityEvent.count({ where: { type: "maintenance_mode_changed", createdAt: window, meta: { path: ["on"], equals: false } } }),
      db.auditLog.count({ where: { action: "user.role_change", createdAt: window } }),
      db.user.count({ where: { createdAt: window, isDemo: false } }),
      // Sign-ups per connection: the first login of accounts made in the window, by its IP hash.
      db.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(n)::int AS max FROM (
          SELECT e."ipHash", COUNT(DISTINCT e."userId")::int AS n
          FROM "SecurityEvent" e JOIN "User" u ON u.id = e."userId"
          WHERE e.type = 'login_success' AND e."createdAt" >= ${since} AND e."createdAt" <= ${now}
            AND u."createdAt" >= ${since} AND u."createdAt" <= ${now} AND u."isDemo" = false AND e."ipHash" IS NOT NULL
          GROUP BY e."ipHash"
        ) per_ip`,
      db.listing.count({ where: { createdAt: window, isDemo: false } }),
      db.booking.count({ where: { createdAt: window } }),
      db.securityEvent.findFirst({ where: { type: "offsite_backup_ok", createdAt: { lte: now } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
  return {
    events: Object.fromEntries(byType.map((row) => [row.type, row._count._all])),
    perIpMax: Object.fromEntries(perIp.map((row) => [row.type, Number(row.max)])),
    staffNewDevices,
    staffSecurityChanges,
    maintenanceOn,
    maintenanceOff,
    roleChanges,
    signupsSite,
    signupsPerIpMax: Number(signupsPerIp[0]?.max ?? 0),
    listingsCreated,
    bookingsCreated,
    offsite: { configured: readOffsiteConfig(process.env) !== null, lastOkAt: lastOk?.createdAt ?? null },
    certificateDaysLeft: opts.certificateDaysLeft ?? null,
    now,
  };
}

/** At most this many waiting tickets are read per run (oldest first). */
const MAX_WAITING_TICKETS = 500;

/**
 * Tickets waiting for our reply (open or in progress, the user wrote after our last public
 * reply), with the time of the user's first unanswered message. Demo accounts' tickets are left
 * out; a ticket without any message counts from its creation.
 */
export async function waitingSupportTickets(): Promise<WaitingTicket[]> {
  const rows = await db.$queryRaw<{ id: string; number: number; waiting_since: Date }[]>`
    SELECT t.id, t.number, COALESCE(MIN(m."createdAt"), t."createdAt") AS waiting_since
    FROM "Ticket" t
    LEFT JOIN "User" u ON u.id = t."userId"
    LEFT JOIN "TicketMessage" m ON m."ticketId" = t.id AND m.internal = false AND m."fromStaff" = false
      AND m."createdAt" > COALESCE(
        (SELECT MAX(s."createdAt") FROM "TicketMessage" s WHERE s."ticketId" = t.id AND s."fromStaff" = true AND s.internal = false),
        'epoch'::timestamp)
    WHERE t.status IN ('OPEN', 'IN_PROGRESS') AND (u.id IS NULL OR u."isDemo" = false)
    GROUP BY t.id, t.number, t."createdAt"
    HAVING COUNT(m.id) > 0 OR NOT EXISTS (SELECT 1 FROM "TicketMessage" x WHERE x."ticketId" = t.id AND x.internal = false)
    ORDER BY waiting_since ASC
    LIMIT ${MAX_WAITING_TICKETS}`;
  return rows.map((row) => ({ id: row.id, number: Number(row.number), waitingSince: new Date(row.waiting_since) }));
}

/** Days until the HTTPS certificate of `host` ends (null when it cannot be read). Never throws. */
export function certificateDaysLeft(host: string, now: Date = new Date(), timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(value);
    };
    const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      const validTo = socket.getPeerCertificate()?.valid_to;
      const end = validTo ? Date.parse(validTo) : NaN;
      finish(Number.isFinite(end) ? Math.floor((end - now.getTime()) / 86_400_000) : null);
    });
    socket.on("error", () => finish(null));
    socket.on("timeout", () => finish(null));
  });
}

/** The real site's host for the certificate check (production, https SITE_URL), else null. */
function certificateHost(): string | null {
  if (!isProductionSite()) return null;
  try {
    const url = new URL(process.env.SITE_URL ?? "");
    return url.protocol === "https:" && url.hostname.includes(".") ? url.hostname : null;
  } catch {
    return null;
  }
}

/** Where founder alerts go on Telegram: ADMIN_ALERT_TELEGRAM_CHAT_ID (private setting), else the admins who connected the bot. */
export async function founderTelegramChats(env: NodeJS.ProcessEnv = process.env): Promise<{ chatId: string; locale: AppLocale }[]> {
  const configured = (env.ADMIN_ALERT_TELEGRAM_CHAT_ID ?? "")
    .split(/[,;\s]+/)
    .map((id) => id.trim())
    .filter((id) => /^-?\d{3,20}$/.test(id));
  if (configured.length) return [...new Set(configured)].map((chatId) => ({ chatId, locale: siteConfig.i18n.primaryLocale }));
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isDemo: false, deletedAt: null, telegramChatId: { not: null } },
    select: { telegramChatId: true, locale: true },
    take: 5,
  });
  return admins.flatMap((admin) =>
    admin.telegramChatId ? [{ chatId: admin.telegramChatId, locale: isAppLocale(admin.locale) ? admin.locale : siteConfig.i18n.primaryLocale }] : [],
  );
}

/** Sends one alert message by email and Telegram. True when at least one channel accepted it. */
export async function deliverSecurityAlerts(alerts: SecurityAlert[], windowMinutes: number, now: Date): Promise<{ email: boolean; telegram: number }> {
  const email = await sendFounderEmail("security_alert", { alerts, windowMinutes, at: now.toISOString() });
  let telegram = 0;
  for (const chat of await founderTelegramChats().catch(() => [])) {
    const t = await getTranslations({ locale: chat.locale, namespace: "emails" });
    const sent = await sendTelegramMessage(chat.chatId, securityAlertTelegramText(alerts, (key, values) => t(key, values), windowMinutes));
    if (sent.ok) telegram += 1;
  }
  return { email, telegram };
}

export type SecurityAlertsDeps = {
  now?: Date;
  claim?: () => Promise<boolean>;
  readState?: () => Promise<SecurityAlertsState>;
  writeState?: (state: SecurityAlertsState) => Promise<void>;
  collect?: (since: Date, now: Date, opts: { certificateDaysLeft?: number | null }) => Promise<SecuritySignals>;
  deliver?: (alerts: SecurityAlert[], windowMinutes: number, now: Date) => Promise<{ email: boolean; telegram: number }>;
  checkCertificate?: (host: string, now: Date) => Promise<number | null>;
  certificateHost?: () => string | null;
  waitingTickets?: () => Promise<WaitingTicket[]>;
};

export type SecurityAlertsResult = { skipped?: "already_running"; alerts: string[]; sent: string[]; email?: boolean; telegram?: number };

/** One run of the hourly job. */
export async function runSecurityAlerts(deps: SecurityAlertsDeps = {}): Promise<SecurityAlertsResult> {
  const now = deps.now ?? new Date();
  const claim = deps.claim ?? (async () => (await rateLimit("security-alerts:run", { limit: 1, windowSeconds: 300 })).ok);
  if (!(await claim())) return { skipped: "already_running", alerts: [], sent: [] };
  const state = await (deps.readState ?? readState)();
  const since = windowStart(now, state.lastRunAt);

  // The certificate: once a day, on the real site only.
  let certDaysLeft = state.certDaysLeft ?? null;
  let certCheckedAt = state.certCheckedAt;
  const host = (deps.certificateHost ?? certificateHost)();
  if (host && (!certCheckedAt || now.getTime() - Date.parse(certCheckedAt) >= 24 * 3600 * 1000)) {
    certDaysLeft = await (deps.checkCertificate ?? certificateDaysLeft)(host, now);
    certCheckedAt = now.toISOString();
  }

  // Support tickets late for the reply promise, each reported once per waiting spell.
  const supportAlerted = state.supportAlerted ?? {};
  const overdue = overdueTickets(await (deps.waitingTickets ?? waitingSupportTickets)(), now);
  const lateNew = newlyOverdue(overdue, supportAlerted);

  const signals = await (deps.collect ?? collectSecuritySignals)(since, now, { certificateDaysLeft: host ? certDaysLeft : null });
  const alerts = evaluateSecurityAlerts({ ...signals, supportOverdue: lateNew.map((ticket) => ticket.number) });
  const due = dueAlerts(alerts, state.lastSent ?? {}, now);
  const lastSent = { ...(state.lastSent ?? {}) };
  let delivery: { email: boolean; telegram: number } | undefined;
  let accepted = false;
  if (due.length) {
    const minutes = Math.max(SECURITY_ALERT_WINDOW_MINUTES, Math.round((now.getTime() - since.getTime()) / 60_000));
    delivery = await (deps.deliver ?? deliverSecurityAlerts)(due, minutes, now);
    // Nothing accepted it (no email and no Telegram): the same alerts go again next hour.
    accepted = delivery.email || delivery.telegram > 0;
    if (accepted) for (const alert of due) lastSent[alert.kind] = now.toISOString();
  }
  const supportSent = accepted && due.some((alert) => alert.kind === "support_overdue") ? lateNew : [];
  await (deps.writeState ?? writeState)({
    lastRunAt: now.toISOString(),
    lastSent,
    certCheckedAt,
    certDaysLeft,
    supportAlerted: nextSupportAlerted(overdue, supportAlerted, supportSent),
  });
  return {
    alerts: alerts.map((a) => a.kind),
    sent: accepted ? due.map((a) => a.kind) : [],
    ...(delivery ? { email: delivery.email, telegram: delivery.telegram } : {}),
  };
}
