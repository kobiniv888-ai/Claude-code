/**
 * Contact channel links (client-safe, pure).
 *
 *   const methods = parseContactMethods(listing.contactMethods);       // server: ordered, valid only
 *   buildChannelHref("WHATSAPP", "+995555123456", message)           // → https://wa.me/995555123456?text=…
 *
 * Values are private until a signed-in visitor taps "Show contact"; these helpers only run on
 * values the server already decided to reveal.
 */
import { CONTACT_CHANNELS, type ContactChannelKey, type ContactMethod } from "@/lib/listing/fields";

/** A revealed contact method. EMAIL has no value: the address stays hidden behind a form. */
export type RevealedContact = { channel: ContactChannelKey; value: string | null };

const CHANNEL_SET = new Set<string>(CONTACT_CHANNELS);
const PHONE_CHANNELS = new Set<ContactChannelKey>(["WHATSAPP", "VIBER", "PHONE", "SMS"]);
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const MESSENGER_USERNAME = /^[A-Za-z0-9.]{1,64}$/;
const MAX_VALUE_LENGTH = 200;

export function isContactChannel(value: unknown): value is ContactChannelKey {
  return typeof value === "string" && CHANNEL_SET.has(value);
}

/** Listing.contactMethods (JSON) → valid methods in the owner's order, one per channel. */
export function parseContactMethods(value: unknown): ContactMethod[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const methods: ContactMethod[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const { channel, value: v, order } = raw as Record<string, unknown>;
    if (!isContactChannel(channel) || seen.has(channel)) return;
    if (typeof v !== "string" || !v.trim() || v.length > MAX_VALUE_LENGTH) return;
    seen.add(channel);
    methods.push({ channel, value: v.trim(), order: typeof order === "number" && Number.isFinite(order) ? order : index });
  });
  return methods.sort((a, b) => a.order - b.order);
}

/** "+995 555-12-34-56" → "995555123456". */
export function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

/** A phone number in international form for tel:/sms: links: "+995555123456" (null when unusable). */
export function e164(value: string): string | null {
  const digits = phoneDigits(value);
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

/** Telegram target for https://t.me/…: a username ("bayit_owner") or "+995555123456". */
export function telegramTarget(value: string): string | null {
  const trimmed = value.trim();
  const fromUrl = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(@?[A-Za-z0-9_+]+)\/?$/i.exec(trimmed)?.[1];
  const raw = (fromUrl ?? trimmed).replace(/^@/, "");
  if (TELEGRAM_USERNAME.test(raw)) return raw;
  if (/^\+?[\d\s()-]+$/.test(raw)) return e164(raw);
  return null;
}

/** Messenger username for https://m.me/… (from "name", "m.me/name" or a facebook.com URL). */
export function messengerUsername(value: string): string | null {
  const trimmed = value.trim();
  const fromUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:m\.me|facebook\.com|fb\.com|messenger\.com\/t)\/([A-Za-z0-9.]+)\/?(?:\?.*)?$/i.exec(trimmed)?.[1];
  const raw = (fromUrl ?? trimmed).replace(/^@/, "");
  return MESSENGER_USERNAME.test(raw) ? raw : null;
}

/**
 * The link that opens the right app with the ready message (null for EMAIL, which opens the
 * site's contact form, or when the value cannot be used).
 */
export function buildChannelHref(channel: ContactChannelKey, value: string | null, message: string): string | null {
  if (!value) return null;
  const text = encodeURIComponent(message);
  if (PHONE_CHANNELS.has(channel)) {
    const phone = e164(value);
    if (!phone) return null;
    const digits = phone.slice(1);
    switch (channel) {
      case "WHATSAPP":
        return `https://wa.me/${digits}${message ? `?text=${text}` : ""}`;
      case "VIBER":
        return `viber://chat?number=%2B${digits}`;
      case "PHONE":
        return `tel:${phone}`;
      case "SMS":
        return `sms:${phone}${message ? `?body=${text}` : ""}`;
    }
  }
  if (channel === "TELEGRAM") {
    const target = telegramTarget(value);
    return target ? `https://t.me/${target}` : null;
  }
  if (channel === "MESSENGER") {
    const username = messengerUsername(value);
    return username ? `https://m.me/${username}${message ? `?text=${text}` : ""}` : null;
  }
  return null;
}

/** Apps that cannot receive a pre-filled message: copy it to the clipboard first. */
export function channelCopiesMessage(channel: ContactChannelKey): boolean {
  return channel === "TELEGRAM" || channel === "VIBER";
}

/** https links open in a new tab; tel:, sms: and viber: hand over to the app directly. */
export function channelOpensNewTab(channel: ContactChannelKey): boolean {
  return channel === "WHATSAPP" || channel === "TELEGRAM" || channel === "MESSENGER";
}

/** What to show next to the button once revealed ("+995555123456", "@bayit_owner"). */
export function displayValue(channel: ContactChannelKey, value: string | null): string | null {
  if (!value) return null;
  if (PHONE_CHANNELS.has(channel)) return e164(value);
  if (channel === "TELEGRAM") {
    const target = telegramTarget(value);
    return target ? (target.startsWith("+") ? target : `@${target}`) : null;
  }
  if (channel === "MESSENGER") return messengerUsername(value);
  return null;
}

/** The value the client receives for a method (EMAIL stays hidden). */
export function revealedValue(method: ContactMethod): string | null {
  return method.channel === "EMAIL" ? null : method.value;
}
