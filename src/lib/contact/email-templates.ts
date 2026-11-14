/**
 * The guest's email after a host changed the contact details of a listing they booked
 * (SECURITY_REPORT 14.3.c, ./changed.ts). Sent once per change to each guest with an upcoming
 * booking; no new contact details in it (the trip page shows them), only the warning.
 */
import type { EmailContent, TemplateContext } from "@/lib/email/templates";

export const CONTACT_EMAIL_TEMPLATES = ["host_contact_changed_guest"] as const;
export type ContactEmailTemplate = (typeof CONTACT_EMAIL_TEMPLATES)[number];

export type ContactEmailData = {
  host_contact_changed_guest: {
    name?: string | null;
    listingTitle: string;
    /** The booking code ("BT-…"). */
    code: string;
    /** The trip page. */
    tripUrl: string;
    /** The scam report page for this booking (SECURITY_REPORT 14.2.c). */
    reportUrl: string;
  };
};

type Builder<K extends ContactEmailTemplate> = (data: ContactEmailData[K], ctx: TemplateContext) => EmailContent;

function isolate(value: string): string {
  return value ? `⁨${value}⁩` : value;
}

export const contactEmailBuilders: { [K in ContactEmailTemplate]: Builder<K> } = {
  host_contact_changed_guest: (data, { t, tb, url, page, brand }) => {
    const key = "templates.host_contact_changed_guest";
    const title = isolate((data.listingTitle ?? "").trim());
    const report = url(data.reportUrl);
    return {
      subject: t(`${key}.subject`, { title }),
      preheader: t(`${key}.preheader`),
      heading: t(`${key}.heading`),
      greetingName: (data.name ?? "").trim() || null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body`, { title, code: data.code }) },
        {
          type: "notice",
          text: tb("noPrepayment", { brand }),
          ...(report ? { link: { label: t("scamReport"), url: report } } : {}),
        },
      ],
      cta: { label: t(`${key}.cta`), url: url(data.tripUrl) ?? page("/account/trips") },
      audience: "account",
    };
  },
};
