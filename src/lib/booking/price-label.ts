import "server-only";
import { detectContactInfo, hasContactInfo } from "@/lib/risk/contact-info";

/**
 * The host's note on a holiday price ("פסח", round 3, brief 6.3) is public text: every visitor of
 * the listing page gets it, the dates sheet shows it on its price line, and it is copied into the
 * booking and its emails. Like the title and the description (the mistake check, the risk engine),
 * it must never carry contact details, which guests get only after signing in (revealContact).
 *
 * Server-only on purpose: the detector pulls the phone-number library, which client components of
 * the public listing page must not load (./terms and ./pricing stay light).
 */

/** The note has a phone number, an email address, a link or an @username. */
export function labelHasContactInfo(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trim() !== "" && hasContactInfo(detectContactInfo(text));
}

/**
 * A stored note ({ he: "פסח" }, or a plain string) as guests may see it: null when the text in any
 * language has contact details (a row saved before the save refused them). Anything else is kept.
 */
export function publicPriceLabel(label: unknown): unknown {
  if (typeof label === "string") return labelHasContactInfo(label) ? null : label;
  if (!label || typeof label !== "object" || Array.isArray(label)) return label ?? null;
  for (const text of Object.values(label as Record<string, unknown>)) {
    if (typeof text === "string" && labelHasContactInfo(text)) return null;
  }
  return label;
}
