import "server-only";
import { db } from "@/lib/db";

/**
 * Phone line type (VoIP detection) with Twilio Lookup v2 "line_type_intelligence".
 * Used by the risk check: virtual numbers ("nonFixedVoip": Google Voice, TextNow, …) are a
 * common scam signal. Results are cached in PhoneLookup for 90 days (a lookup costs ≈ $0.008).
 *
 * Needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (the same account as Twilio Verify).
 * Set TWILIO_LOOKUP_ENABLED="false" to switch it off while keeping Verify. Without credentials
 * the check is skipped (returns null).
 */

const LOOKUP_API = "https://lookups.twilio.com/v2/PhoneNumbers";
const CACHE_DAYS = 90;
const TIMEOUT_MS = 8_000;

export type PhoneLineInfo = {
  lineType: string | null;
  carrier: string | null;
  isVoip: boolean;
  cached: boolean;
};

function credentials(): { sid: string; token: string } | null {
  if (process.env.TWILIO_LOOKUP_ENABLED?.trim().toLowerCase() === "false") return null;
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  return sid && token ? { sid, token } : null;
}

export function isPhoneLookupEnabled(): boolean {
  return credentials() !== null;
}

type LookupResponse = {
  valid?: boolean;
  line_type_intelligence?: { type?: string | null; carrier_name?: string | null; error_code?: number | null } | null;
};

/** Line type of an E.164 number, from the cache or Twilio. Null when disabled or on error. */
export async function lookupPhoneLine(phoneNumber: string): Promise<PhoneLineInfo | null> {
  if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) return null;
  const cutoff = new Date(Date.now() - CACHE_DAYS * 24 * 3600 * 1000);
  const cachedRow = await db.phoneLookup.findUnique({ where: { phoneNumber } }).catch(() => null);
  if (cachedRow && cachedRow.checkedAt >= cutoff) {
    return { lineType: cachedRow.lineType, carrier: cachedRow.carrier, isVoip: cachedRow.isVoip, cached: true };
  }

  const creds = credentials();
  if (!creds) return null;
  try {
    const res = await fetch(`${LOOKUP_API}/${encodeURIComponent(phoneNumber)}?Fields=line_type_intelligence`, {
      headers: { Authorization: `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString("base64")}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as LookupResponse;
    const info = data.line_type_intelligence;
    const lineType = info?.type ?? null;
    const carrier = info?.carrier_name?.slice(0, 200) ?? null;
    const isVoip = lineType === "nonFixedVoip";
    await db.phoneLookup.upsert({
      where: { phoneNumber },
      create: { phoneNumber, lineType, carrier, isVoip },
      update: { lineType, carrier, isVoip, checkedAt: new Date() },
    });
    return { lineType, carrier, isVoip, cached: false };
  } catch (error) {
    console.error("[risk] phone lookup failed:", error);
    return null;
  }
}
