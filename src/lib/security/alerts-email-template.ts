/**
 * The founder's security alert email (SECURITY_REPORT 16.3): its data and layout. Pure (no server
 * imports), like src/lib/email/templates.ts, which registers it. Text lives in
 * messages/<locale>/emails.json under templates.security_alert.*. Sent by ./alerts.ts, together
 * with the same lines by Telegram.
 *
 * Counts and kinds only: no names, email addresses, phone numbers, IPs or ids (the audit log and
 * the security event log hold the rest, for staff).
 */
import type { EmailContent, TemplateContext } from "@/lib/email/templates";
import { SECURITY_ALERT_KINDS, type SecurityAlert } from "./alerts-rules";

export const SECURITY_ALERT_EMAIL_TEMPLATES = ["security_alert"] as const;
export type SecurityAlertEmailTemplate = (typeof SECURITY_ALERT_EMAIL_TEMPLATES)[number];

export type SecurityAlertEmailData = {
  security_alert: {
    alerts: SecurityAlert[];
    /** Minutes the counts cover (the hourly job: 60 or a little more). */
    windowMinutes: number;
    /** ISO time of the run. */
    at: string;
  };
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** One line per alert, in the recipient's language (also the Telegram text). */
export function securityAlertLines(alerts: SecurityAlert[], t: Translate): string[] {
  return alerts
    .filter((alert) => (SECURITY_ALERT_KINDS as readonly string[]).includes(alert.kind))
    .map((alert) =>
      t(`templates.security_alert.kinds.${alert.kind}`, {
        count: alert.count,
        threshold: alert.threshold ?? 0,
        days: alert.days ?? 0,
      }),
    );
}

/** The Telegram message: heading, the lines, where to look. Plain text. */
export function securityAlertTelegramText(alerts: SecurityAlert[], t: Translate, windowMinutes: number): string {
  const key = "templates.security_alert";
  return [t(`${key}.heading`), t(`${key}.intro`, { minutes: windowMinutes }), "", ...securityAlertLines(alerts, t).map((line) => `• ${line}`), "", t(`${key}.final`)].join("\n");
}

export const securityAlertEmailBuilders: {
  security_alert: (data: SecurityAlertEmailData["security_alert"], ctx: TemplateContext) => EmailContent;
} = {
  security_alert: (data, ctx) => {
    const { t, page } = ctx;
    const key = "templates.security_alert";
    const lines = securityAlertLines(data.alerts, t);
    return {
      subject: t(`${key}.subject`, { count: lines.length }),
      preheader: lines[0] ?? t(`${key}.heading`),
      heading: t(`${key}.heading`),
      greetingName: null,
      blocks: [
        { type: "paragraph", text: t(`${key}.intro`, { minutes: data.windowMinutes }) },
        ...lines.map((text) => ({ type: "notice" as const, text })),
        { type: "paragraph", text: t(`${key}.final`) },
      ],
      cta: { label: t(`${key}.cta`), url: page("/admin/audit") },
      audience: "account",
    };
  },
};
