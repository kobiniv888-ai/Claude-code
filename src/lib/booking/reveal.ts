/**
 * What a confirmed guest gets (client-safe, pure): the host's phone / WhatsApp and directions.
 * The server decides WHEN to reveal (canRevealHostContact in ./policy); these helpers only shape
 * values it already chose to send.
 */
import { e164, parseContactMethods } from "@/lib/contact/links";

export type HostContact = {
  /** E.164 ("+995555123456"): a "call" link (tel:). */
  phone: string | null;
  /** E.164 for https://wa.me/<digits>. */
  whatsapp: string | null;
};

/**
 * From the listing's contact methods (WHATSAPP, then PHONE / VIBER / SMS), falling back to the
 * host's verified account phone.
 */
export function hostContactFor(contactMethods: unknown, verifiedOwnerPhone: string | null | undefined): HostContact {
  const methods = parseContactMethods(contactMethods);
  const valueOf = (...channels: string[]) => {
    for (const channel of channels) {
      const method = methods.find((m) => m.channel === channel);
      const phone = method ? e164(method.value) : null;
      if (phone) return phone;
    }
    return null;
  };
  const owner = verifiedOwnerPhone ? e164(verifiedOwnerPhone) : null;
  const whatsapp = valueOf("WHATSAPP");
  const phone = valueOf("PHONE", "WHATSAPP", "VIBER", "SMS") ?? owner;
  return { phone, whatsapp };
}

export function whatsappUrl(phone: string, text?: string): string {
  const digits = phone.replace(/\D+/g, "");
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

export type Directions = { google: string; waze: string };

/** Directions links to the exact point (Google Maps and Waze, no API key). */
export function directionsFor(lat: number | null | undefined, lng: number | null | undefined): Directions | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const point = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${point}`,
    waze: `https://waze.com/ul?ll=${point}&navigate=yes`,
  };
}
