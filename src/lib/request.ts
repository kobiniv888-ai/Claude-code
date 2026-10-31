import "server-only";
import { cookies, headers } from "next/headers";
import { hmacHash } from "@/lib/crypto";

/**
 * Facts about the current request (server-only): visitor IP, country, device id, user agent.
 * Raw IPs and device ids are never stored — use the hashed versions for logs and rate limits.
 *
 * Which header holds the real client IP depends on the host:
 * - Vercel sets x-vercel-forwarded-for / x-forwarded-for itself (clients cannot spoof them).
 * - Behind Cloudflare or another proxy, set CLIENT_IP_HEADER (e.g. "cf-connecting-ip") so only
 *   that header is trusted.
 */

export const DEVICE_COOKIE = "bayit_did";

function firstForwarded(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

/** Strips IPv6-mapped IPv4 ("::ffff:1.2.3.4") and ports ("1.2.3.4:5678", "[::1]:80"). */
function cleanIp(ip: string | null): string | null {
  if (!ip) return null;
  let value = ip.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) value = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) value = value.replace(/:\d+$/, "");
  value = value.replace(/^::ffff:/i, "");
  if (value.length > 64 || !/^[0-9a-fA-F:.]+$/.test(value)) return null;
  return value;
}

/** The visitor's IP address, or null when it cannot be determined. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const trusted = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trusted) return cleanIp(firstForwarded(h.get(trusted)));

  if (process.env.VERCEL) {
    return cleanIp(firstForwarded(h.get("x-vercel-forwarded-for")) ?? firstForwarded(h.get("x-forwarded-for")));
  }
  return cleanIp(firstForwarded(h.get("x-forwarded-for")) ?? h.get("x-real-ip"));
}

/** HMAC of the visitor's IP (safe to store), or null. */
export async function getIpHash(): Promise<string | null> {
  const ip = await getClientIp();
  return ip ? hmacHash(`ip:${ip}`) : null;
}

/** ISO 3166-1 alpha-2 country of the visitor (from the host's geo header), e.g. "IL". */
export async function getCountryCode(): Promise<string | null> {
  const h = await headers();
  const value = (h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? "").trim().toUpperCase();
  // "XX" = unknown, "T1" = Tor (Cloudflare).
  if (!/^[A-Z]{2}$/.test(value) || value === "XX" || value === "T1") return null;
  return value;
}

/**
 * The random first-party device id set by src/proxy.ts (cookie "bayit_did").
 * Null on the very first request of a new visitor (the cookie is set on that response).
 */
export async function getDeviceId(): Promise<string | null> {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/** HMAC of the device id (stored in DeviceLink / AuditLog), or null. */
export async function getDeviceHash(): Promise<string | null> {
  const id = await getDeviceId();
  return id ? hmacHash(`device:${id}`) : null;
}

export async function getUserAgent(): Promise<string | null> {
  const value = (await headers()).get("user-agent");
  return value ? value.slice(0, 512) : null;
}
