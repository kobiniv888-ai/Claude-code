import "server-only";
import { getTranslations } from "next-intl/server";
import { Resend } from "resend";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { isAppLocale } from "@/i18n/locale";
import { siteUrl } from "@/lib/site-url";
import { readSiteEnv } from "@/lib/site-env";
import type { EmailStatus } from "@/generated/prisma/enums";
import { renderEmailHtml, renderEmailText, type LayoutContext } from "./layout";
import { buildEmailContent, type EmailData, type EmailTemplate, type TemplateContext } from "./templates";

/**
 * Transactional email (server-only), in the recipient's language.
 *
 *   await sendEmail({
 *     to: owner.email, locale: owner.locale, template: "listing_approved",
 *     data: { ownerName: owner.name, listingTitle: listing.title, listingUrl: listingPath(…) },
 *   });
 *
 * Sends through Resend when RESEND_API_KEY is set; otherwise the email is printed to the
 * server log. Either way a row is written to EmailOutbox (the admin "email outbox").
 * Never throws — returns { ok: false } when the email could not be sent.
 */

export { EMAIL_TEMPLATES, type EmailData, type EmailTemplate } from "./templates";

/** Phone-only sign-ups get a placeholder address "<digits>@phone.bayit.invalid". */
export const PLACEHOLDER_EMAIL_DOMAIN = "phone.bayit.invalid";

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** Where to send a user's notifications: their contact email, else their login email, never a placeholder. */
export function notificationEmailFor(user: { email: string; contactEmail?: string | null }): string | null {
  for (const candidate of [user.contactEmail, user.email]) {
    const value = candidate?.trim();
    if (value && !isPlaceholderEmail(value) && isEmailAddress(value)) return value;
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function isEmailAddress(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export type SendEmailInput<K extends EmailTemplate> = {
  to: string;
  template: K;
  locale: AppLocale | string;
  data: EmailData[K];
  /** e.g. the guest's address for "contact_owner", so the owner can simply reply. */
  replyTo?: string | null;
  /**
   * Secrets in the email (a login code): sent as they are, but masked in the EmailOutbox row
   * (staff can read the outbox) and in production logs.
   */
  redact?: string[];
  /** Keep it in the outbox only, never send it (demo accounts, whose addresses are made up). */
  outboxOnly?: boolean;
  /**
   * Resend tags, e.g. { booking: "BT-7K3Q9" }: a bounce report (src/app/api/webhooks/resend)
   * carries them back. Names and values: ASCII letters, digits, "_" and "-" (others are dropped).
   */
  tags?: Record<string, string>;
  /**
   * Extra mail headers, e.g. List-Unsubscribe (RFC 8058 one-click) for bulk mail such as the
   * weekly digest. Only these names are sent; values with a line break are dropped.
   */
  headers?: Record<string, string>;
};

/** The headers sendEmail passes on (anything else could be misused to forge the message). */
const ALLOWED_HEADERS = new Set(["List-Unsubscribe", "List-Unsubscribe-Post"]);

/** The allowed, single-line headers of an email (exported for the tests). */
export function safeEmailHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out = Object.fromEntries(Object.entries(headers).filter(([name, value]) => ALLOWED_HEADERS.has(name) && typeof value === "string" && !/[\r\n]/.test(value)));
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * What happened to an email:
 * - "sent": Resend accepted it (it returned an id) — this counts as "the recipient was told";
 * - "logged": kept in the outbox only (no RESEND_API_KEY, or outboxOnly);
 * - "failed": not sent (bad address, Resend refused it, rendering failed).
 * `ok` is false only for "failed".
 */
export type SendEmailResult = { ok: boolean; delivery: "sent" | "logged" | "failed"; providerId?: string | null };

export type RenderedEmail = { subject: string; html: string; text: string };

// ─── Rendering ────────────────────────────────────────────────

/** Links in emails use the permanent address (SITE_URL, @/lib/site-url). */
function siteBase(): string {
  return siteUrl();
}

const LOCALE_PREFIX = new RegExp(`^/(${locales.join("|")})(/|$)`);

function pageUrl(locale: AppLocale, path: string): string {
  const clean = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${siteBase()}/${locale}${clean}`;
}

/** Absolute, safe URL for links from template data (paths get the site and locale prefix). */
function safeUrl(locale: AppLocale, value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return LOCALE_PREFIX.test(raw) ? `${siteBase()}${raw}` : pageUrl(locale, raw);
  }
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Renders subject, HTML and text. Exported for admin previews. */
export async function renderEmail<K extends EmailTemplate>(
  template: K,
  localeInput: AppLocale | string,
  data: EmailData[K],
): Promise<RenderedEmail> {
  const locale: AppLocale = isAppLocale(localeInput) ? localeInput : siteConfig.i18n.fallbackLocale;
  const [translate, translateBooking] = await Promise.all([
    getTranslations({ locale, namespace: "emails" }),
    getTranslations({ locale, namespace: "booking" }),
  ]);
  const t = (key: string, values?: Record<string, string | number>) => translate(key, values);
  const tb = (key: string, values?: Record<string, string | number>) => translateBooking(key, values);
  const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
  const page = (path: string) => pageUrl(locale, path);

  const templateContext: TemplateContext = {
    locale,
    t,
    tb,
    url: (value) => safeUrl(locale, value),
    page,
    formatDate: (date) => formatDate(date, locale, { dateStyle: "long" }),
    brand,
  };
  const content = buildEmailContent(template, data, templateContext);
  const layoutContext: LayoutContext = { locale, brand, t, page };
  return {
    // Subjects are plain text: no bidi isolate marks (some mail apps show them as boxes).
    subject: content.subject.replace(/[\u2068\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, 250),
    html: renderEmailHtml(content, layoutContext),
    text: renderEmailText(content, layoutContext),
  };
}

// ─── Sending ──────────────────────────────────────────────────

let resendClient: Resend | null = null;

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

/** True when emails really go out (RESEND_API_KEY is set); otherwise they are only logged. */
export function isEmailDeliveryConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

function maskSecrets(rendered: RenderedEmail, secrets: string[] | undefined): RenderedEmail {
  const list = (secrets ?? []).filter((secret) => secret.length >= 4);
  if (list.length === 0) return rendered;
  const mask = (value: string) => list.reduce((text, secret) => text.split(secret).join("•".repeat(secret.length)), value);
  return { subject: mask(rendered.subject), html: mask(rendered.html), text: mask(rendered.text) };
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || `${siteConfig.name} <onboarding@resend.dev>`;
}

async function recordOutbox(entry: {
  to: string;
  template: EmailTemplate;
  locale: AppLocale;
  rendered: RenderedEmail;
  status: EmailStatus;
  provider?: string;
  providerId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    await db.emailOutbox.create({
      data: {
        to: entry.to.slice(0, 320),
        template: entry.template,
        locale: entry.locale,
        subject: entry.rendered.subject,
        html: entry.rendered.html,
        text: entry.rendered.text,
        status: entry.status,
        provider: entry.provider,
        providerId: entry.providerId ?? null,
        error: entry.error ? entry.error.slice(0, 1000) : null,
        sentAt: entry.status === "SENT" ? new Date() : null,
      },
    });
  } catch (error) {
    console.error("[email] could not write the outbox row:", error);
  }
}

export async function sendEmail<K extends EmailTemplate>({
  to,
  template,
  locale: localeInput,
  data,
  replyTo,
  redact,
  outboxOnly,
  tags,
  headers,
}: SendEmailInput<K>): Promise<SendEmailResult> {
  const locale: AppLocale = isAppLocale(localeInput) ? localeInput : siteConfig.i18n.fallbackLocale;
  const recipient = (to ?? "").trim();

  let rendered: RenderedEmail;
  try {
    rendered = await renderEmail(template, locale, data);
  } catch (error) {
    console.error(`[email] could not render "${template}":`, error);
    await recordOutbox({
      to: recipient,
      template,
      locale,
      rendered: { subject: `[${template}]`, html: "", text: "" },
      status: "FAILED",
      error: `render: ${(error as Error)?.message ?? String(error)}`,
    });
    return { ok: false, delivery: "failed" };
  }

  // What the outbox (and a production log) may keep: secrets masked.
  const stored = maskSecrets(rendered, redact);

  if (!isEmailAddress(recipient) || isPlaceholderEmail(recipient)) {
    await recordOutbox({
      to: recipient,
      template,
      locale,
      rendered: stored,
      status: "FAILED",
      error: isPlaceholderEmail(recipient) ? "placeholder address (phone-only account)" : "invalid address",
    });
    return { ok: false, delivery: "failed" };
  }

  const client = outboxOnly ? null : resend();
  if (!client) {
    // The full text (codes unmasked) only on a development server of a development site.
    const logged = process.env.NODE_ENV !== "production" && readSiteEnv() === "development" ? rendered : stored;
    console.info(
      `[email] RESEND_API_KEY is not set — not sent (see the admin email outbox).\n` +
        `  to: ${recipient}\n  template: ${template} (${locale})\n  subject: ${logged.subject}\n\n${logged.text}\n`,
    );
    await recordOutbox({ to: recipient, template, locale, rendered: stored, status: "LOGGED", provider: outboxOnly ? "outbox" : "console" });
    return { ok: true, delivery: "logged" };
  }

  const reply = replyTo?.trim();
  try {
    const { data: sent, error } = await client.emails.send({
      from: fromAddress(),
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: reply && isEmailAddress(reply) ? reply : undefined,
      tags: resendTags(template, tags),
      headers: safeEmailHeaders(headers),
    });
    if (error) {
      console.error(`[email] Resend rejected "${template}" to ${recipient}:`, error.message);
      await recordOutbox({ to: recipient, template, locale, rendered: stored, status: "FAILED", provider: "resend", error: error.message });
      return { ok: false, delivery: "failed" };
    }
    // Resend accepted it only when it returned an id.
    if (!sent?.id) {
      await recordOutbox({ to: recipient, template, locale, rendered: stored, status: "FAILED", provider: "resend", error: "no id returned" });
      return { ok: false, delivery: "failed" };
    }
    await recordOutbox({
      to: recipient,
      template,
      locale,
      rendered: stored,
      status: "SENT",
      provider: "resend",
      providerId: sent.id,
    });
    return { ok: true, delivery: "sent", providerId: sent.id };
  } catch (error) {
    console.error(`[email] sending "${template}" failed:`, error);
    await recordOutbox({
      to: recipient,
      template,
      locale,
      rendered: stored,
      status: "FAILED",
      provider: "resend",
      error: (error as Error)?.message ?? String(error),
    });
    return { ok: false, delivery: "failed" };
  }
}

const TAG_PART = /^[A-Za-z0-9_-]{1,256}$/;

/** Resend's tags: the template, plus the caller's (invalid names or values are dropped). */
export function resendTags(template: EmailTemplate, extra: Record<string, string> | undefined): { name: string; value: string }[] {
  const tags: { name: string; value: string }[] = [{ name: "template", value: template }];
  for (const [name, value] of Object.entries(extra ?? {})) {
    if (name !== "template" && TAG_PART.test(name) && TAG_PART.test(value)) tags.push({ name, value });
  }
  return tags;
}

/**
 * Sends an email that was kept in the outbox (status LOGGED) as it was rendered then: the admin
 * outbox's "send again" once Resend is set up (src/lib/admin/actions/outbox.ts checks who may and
 * which emails). Returns Resend's id, or why it was not sent. Never throws.
 */
export async function deliverStoredEmail(row: {
  to: string;
  subject: string;
  html: string;
  text: string | null;
  template: string;
}): Promise<{ ok: true; providerId: string } | { ok: false; error: string }> {
  const client = resend();
  if (!client) return { ok: false, error: "not_configured" };
  const recipient = row.to.trim();
  if (!isEmailAddress(recipient) || isPlaceholderEmail(recipient)) return { ok: false, error: "invalid address" };
  try {
    const { data: sent, error } = await client.emails.send({
      from: fromAddress(),
      to: recipient,
      subject: row.subject,
      html: row.html,
      text: row.text ?? undefined,
      tags: [{ name: "template", value: TAG_PART.test(row.template) ? row.template : "resent" }, { name: "resent", value: "1" }],
    });
    if (error) return { ok: false, error: error.message };
    if (!sent?.id) return { ok: false, error: "no id returned" };
    return { ok: true, providerId: sent.id };
  } catch (error) {
    return { ok: false, error: (error as Error)?.message ?? String(error) };
  }
}
