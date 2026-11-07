/**
 * The host's contact buttons on the trip page (round 3, brief 7.1; pure, client-safe).
 *
 * Every way the host chose in the contact step (Listing.contactMethods, in the host's order),
 * revealed only to the guest of a confirmed or completed booking (the server decides that,
 * src/lib/booking/policy.ts canRevealHostContact). Phone numbers go through src/lib/phone.ts:
 * E.164 without the national 0 (numbers saved without a country code use the listing's country).
 *
 * - WhatsApp: wa.me with the ready message; phone: tel:; SMS: sms: with the message; Viber:
 *   viber://chat; Telegram: t.me; Messenger: m.me.
 * - Email is left out: the host's address is never shown (guests write through the site).
 * - No usable method: the host's verified account phone as a "call" button (as before).
 */
import { messengerUsername, telegramTarget } from "@/lib/contact/links";
import type { ContactChannelKey, ContactMethod } from "@/lib/listing/fields";
import { formatPhoneForDisplay, normalizePhone, smsHref, telHref, whatsappHref } from "@/lib/phone";

export type TripContactButton = {
  channel: Exclude<ContactChannelKey, "EMAIL">;
  href: string;
  /** "+995 555 12 34 56", "@bayit_host" (show inside <Ltr>), or null. */
  display: string | null;
  /** https links open in a new tab; tel:, sms: and viber: hand over to the app. */
  newTab: boolean;
};

function viberHref(value: string, country: string | null): string | null {
  const phone = normalizePhone(value, country);
  return phone ? `viber://chat?number=%2B${phone.slice(1)}` : null;
}

function button(method: ContactMethod, country: string | null, message: string): TripContactButton | null {
  const { channel, value } = method;
  const phoneDisplay = () => {
    const phone = normalizePhone(value, country);
    return phone ? formatPhoneForDisplay(phone) : null;
  };
  switch (channel) {
    case "WHATSAPP": {
      const href = whatsappHref(value, message, country);
      return href ? { channel, href, display: phoneDisplay(), newTab: true } : null;
    }
    case "PHONE": {
      const href = normalizePhone(value, country) ? telHref(value, country) : null;
      return href ? { channel, href, display: phoneDisplay(), newTab: false } : null;
    }
    case "SMS": {
      const href = smsHref(value, message, country);
      return href ? { channel, href, display: phoneDisplay(), newTab: false } : null;
    }
    case "VIBER": {
      const href = viberHref(value, country);
      return href ? { channel, href, display: phoneDisplay(), newTab: false } : null;
    }
    case "TELEGRAM": {
      const target = telegramTarget(value);
      return target ? { channel, href: `https://t.me/${target}`, display: target.startsWith("+") ? target : `@${target}`, newTab: true } : null;
    }
    case "MESSENGER": {
      const username = messengerUsername(value);
      return username ? { channel, href: `https://m.me/${username}`, display: username, newTab: true } : null;
    }
    default:
      return null;
  }
}

export function tripContactButtons(
  methods: readonly ContactMethod[],
  options: { verifiedOwnerPhone?: string | null; country?: string | null; message: string },
): TripContactButton[] {
  const country = options.country ?? null;
  const buttons = methods.map((method) => button(method, country, options.message)).filter((b): b is TripContactButton => b !== null);
  if (buttons.length > 0) return buttons;
  const owner = options.verifiedOwnerPhone ? normalizePhone(options.verifiedOwnerPhone) : null;
  const href = owner ? telHref(owner) : null;
  return owner && href ? [{ channel: "PHONE", href, display: formatPhoneForDisplay(owner), newTab: false }] : [];
}
