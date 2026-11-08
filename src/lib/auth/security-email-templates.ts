/**
 * Account-security emails (SECURITY_REPORT 3.6.d/e, 3.7.a/c/e): their data and layout. Pure (no
 * server imports), like src/lib/email/templates.ts, which registers them. Text lives in
 * messages/<locale>/emails.json under templates.security_*. Sent by ./security-notices.ts.
 *
 * - security_code: a 6-digit code to confirm a change ("confirm"), to reset the 2-step counter
 *   ("unlock") or to confirm a new contact address ("contact"). The code is never in the subject
 *   (lock screens show subjects).
 * - security_change: something changed on the account, sent to the OLD address (P3 a: email only):
 *   "If this wasn't you…", with the new value masked and a link to secure the account.
 * - security_new_device: a sign-in from a device the account has not used before (hosts, staff).
 * - security_staff_alert: to the founder: a staff account signed in on a new device, was locked
 *   after 20 wrong 2-step codes, or used a recovery code.
 */
import type { EmailBlock, EmailContent, TemplateContext } from "@/lib/email/templates";
import { formatTime } from "@/lib/format";

export const SECURITY_EMAIL_TEMPLATES = ["security_code", "security_change", "security_new_device", "security_staff_alert"] as const;
export type SecurityEmailTemplate = (typeof SECURITY_EMAIL_TEMPLATES)[number];

export const SECURITY_CODE_EMAIL_PURPOSES = ["confirm", "unlock", "contact"] as const;
export const SECURITY_CHANGE_KINDS = [
  "contact_email",
  "contact_email_removed",
  "phone",
  "login_method_added",
  "login_method_removed",
  "two_factor_on",
  "two_factor_off",
  "authenticator_changed",
  "recovery_codes_new",
  "recovery_code_used",
  "totp_locked",
  // A listing's guest-facing contact details changed (SECURITY_REPORT 3.6.a, src/lib/wizard/contact-proof.ts).
  "listing_contact",
] as const;
export type SecurityChangeKind = (typeof SECURITY_CHANGE_KINDS)[number];
export const STAFF_ALERT_KINDS = ["new_device", "totp_locked", "recovery_code_used"] as const;
export type StaffAlertKind = (typeof STAFF_ALERT_KINDS)[number];

export type SecurityEmailData = {
  security_code: {
    code: string;
    minutes: number;
    purpose: (typeof SECURITY_CODE_EMAIL_PURPOSES)[number];
    name?: string | null;
  };
  security_change: {
    kind: SecurityChangeKind;
    /** The new value, already masked ("da***@example.com", "+972 *** ** 34"), or null. */
    masked?: string | null;
    /** "google" | "apple" for login-method changes. */
    provider?: string | null;
    /** Recovery codes left (recovery_code_used). */
    left?: number | null;
    /** ISO time of the change. */
    at: string;
    name?: string | null;
  };
  security_new_device: {
    /** "Chrome · Android" (from the browser's user agent; never the IP). */
    device: string | null;
    at: string;
    name?: string | null;
  };
  security_staff_alert: {
    kind: StaffAlertKind;
    staffName: string;
    role: string;
    device?: string | null;
    at: string;
  };
};

type Builder<K extends SecurityEmailTemplate> = (data: SecurityEmailData[K], ctx: TemplateContext) => EmailContent;

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** "8 Nov 2026, 14:05" in the recipient's language (the site's time zone, Western digits). */
function when(at: string, ctx: TemplateContext): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${ctx.formatDate(date)}, ${formatTime(date, ctx.locale)}`;
}

const PROVIDERS = new Set(["google", "apple"]);

export const securityEmailBuilders: { [K in SecurityEmailTemplate]: Builder<K> } = {
  security_code: (data, { t, brand }) => {
    const key = "templates.security_code";
    const purpose = (SECURITY_CODE_EMAIL_PURPOSES as readonly string[]).includes(data.purpose) ? data.purpose : "confirm";
    return {
      subject: t(`${key}.subject.${purpose}`, { brand }),
      preheader: t(`${key}.preheader`, { minutes: data.minutes }),
      heading: t(`${key}.heading.${purpose}`),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body.${purpose}`, { brand }) },
        { type: "code", label: t(`${key}.codeLabel`), code: data.code },
        { type: "paragraph", text: t(`${key}.valid`, { minutes: data.minutes }) },
        { type: "notice", text: t(`${key}.neverShare`, { brand }) },
        { type: "notice", text: t(`${key}.notYou`, { brand }) },
      ],
      audience: "account",
    };
  },

  security_change: (data, ctx) => {
    const { t, page, brand } = ctx;
    const key = "templates.security_change";
    const kind = (SECURITY_CHANGE_KINDS as readonly string[]).includes(data.kind) ? data.kind : "contact_email";
    const provider = PROVIDERS.has(clean(data.provider)) ? t(`${key}.providers.${clean(data.provider)}`) : t(`${key}.providers.other`);
    const rows: { label: string; value: string; ltr?: boolean }[] = [];
    const time = when(data.at, ctx);
    if (time) rows.push({ label: t(`${key}.whenLabel`), value: time });
    if (clean(data.masked)) rows.push({ label: t(`${key}.newValueLabel`), value: clean(data.masked), ltr: true });
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t(`${key}.kinds.${kind}`, { brand, provider, left: data.left ?? 0 }) },
      ...(rows.length ? [{ type: "details" as const, rows }] : []),
      { type: "paragraph", text: t(`${key}.ifYou`) },
      { type: "notice", text: t(`${key}.notYou`, { brand }), link: { label: t(`${key}.contactLink`), url: page("/contact") } },
    ];
    return {
      subject: t(`${key}.subject.${kind}`, { brand }),
      preheader: t(`${key}.preheader`),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks,
      cta: { label: t(`${key}.cta`), url: page("/account/settings#security") },
      audience: "account",
    };
  },

  security_new_device: (data, ctx) => {
    const { t, page, brand } = ctx;
    const key = "templates.security_new_device";
    const rows = [
      { label: t(`${key}.deviceLabel`), value: clean(data.device) || t(`${key}.unknownDevice`) },
      ...(when(data.at, ctx) ? [{ label: t(`${key}.whenLabel`), value: when(data.at, ctx) }] : []),
    ];
    return {
      subject: t(`${key}.subject`, { brand }),
      preheader: t(`${key}.preheader`),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body`, { brand }) },
        { type: "details", rows },
        { type: "paragraph", text: t(`${key}.ifYou`) },
        { type: "notice", text: t(`${key}.notYou`, { brand }), link: { label: t(`${key}.contactLink`), url: page("/contact") } },
      ],
      cta: { label: t(`${key}.cta`), url: page("/account/settings#security") },
      audience: "account",
    };
  },

  security_staff_alert: (data, ctx) => {
    const { t, page } = ctx;
    const key = "templates.security_staff_alert";
    const kind = (STAFF_ALERT_KINDS as readonly string[]).includes(data.kind) ? data.kind : "new_device";
    const rows = [
      { label: t(`${key}.staffLabel`), value: `${clean(data.staffName) || "—"} (${clean(data.role)})` },
      ...(clean(data.device) ? [{ label: t(`${key}.deviceLabel`), value: clean(data.device) }] : []),
      ...(when(data.at, ctx) ? [{ label: t(`${key}.whenLabel`), value: when(data.at, ctx) }] : []),
    ];
    return {
      subject: t(`${key}.subject.${kind}`),
      preheader: t(`${key}.body.${kind}`),
      heading: t(`${key}.heading`),
      greetingName: null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body.${kind}`) },
        { type: "details", rows },
        { type: "notice", text: t(`${key}.final`) },
      ],
      cta: { label: t(`${key}.cta`), url: page("/admin/roles") },
      audience: "account",
    };
  },
};
