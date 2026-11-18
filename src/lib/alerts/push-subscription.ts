import { z } from "zod";

/**
 * Browser notification subscriptions (round 3): what the settings page sends when a host turns
 * notifications on for a device. Pure and client-safe, so it is unit-tested.
 *
 * The server POSTs every alert to the subscription's endpoint, so only the real push services are
 * accepted (Chrome / Edge / Android / Samsung / Opera: FCM; Firefox: Mozilla; Safari and iPhone:
 * Apple; Windows: WNS). Anything else could make the server call an address of the caller's choice.
 */

const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

/** An https URL on a known push service (the host itself or a subdomain of it). */
export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

const base64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** PushSubscription.toJSON() from the browser. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, { message: "push_endpoint" }),
  keys: z.object({
    // A P-256 public key (65 bytes → 87 base64url characters) and a 16-byte secret (22).
    p256dh: base64url.min(80).max(100),
    auth: base64url.min(16).max(40),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushEndpointSchema = z.object({ endpoint: z.string().max(1000) });

/** Devices one account may keep (the oldest goes when another is added). */
export const MAX_PUSH_DEVICES = 10;

/**
 * "iPhone · Safari", "Android · Chrome", "Windows · Edge": a short label from the User-Agent for
 * the settings list (no version numbers, nothing identifying). Unknown parts are left out.
 */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? "";
  if (!ua) return null;
  const device = /iPhone|iPod/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua))
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(ua)
            ? "Mac"
            : /Linux|CrOS/.test(ua)
              ? "Linux"
              : null;
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  const parts = [device, browser].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What the service worker (public/sw.js) receives in a push message. */
export type PushPayload = {
  title: string;
  body: string;
  /** A same-site path to open on click, e.g. "/he/account/host-bookings/BT-7K3Q9". */
  url: string;
  /** Replaces an earlier notification with the same tag (one per booking). */
  tag?: string;
};
