import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { EmailEvent } from "@/lib/booking/alert-rules";

/**
 * Resend webhooks (sent through Svix): signature check and payload parsing. Pure (node:crypto, no
 * server imports), so it is unit-tested. The route is src/app/api/webhooks/resend/route.ts.
 *
 * Svix signs `${svix-id}.${svix-timestamp}.${raw body}` with HMAC-SHA256; the key is the
 * base64 part of the signing secret ("whsec_…", RESEND_WEBHOOK_SECRET). The `svix-signature`
 * header holds one or more "v1,<base64>" entries separated by spaces (several while a secret is
 * being rotated). Timestamps older or newer than 5 minutes are refused (replays).
 */

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function svixHeadersOf(headers: Pick<Headers, "get">): SvixHeaders {
  return {
    id: headers.get("svix-id") ?? headers.get("webhook-id"),
    timestamp: headers.get("svix-timestamp") ?? headers.get("webhook-timestamp"),
    signature: headers.get("svix-signature") ?? headers.get("webhook-signature"),
  };
}

function secretKey(secret: string): Buffer | null {
  const raw = secret.trim();
  if (!raw) return null;
  const key = Buffer.from(raw.startsWith("whsec_") ? raw.slice("whsec_".length) : raw, "base64");
  return key.length > 0 ? key : null;
}

/** The "v1,<base64>" signature Svix sends for this message (exported for tests and tools). */
export function signSvix(secret: string, id: string, timestamp: string | number, body: string): string {
  const key = secretKey(secret);
  if (!key) throw new Error("signSvix: empty secret");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

export function verifySvixSignature(input: {
  secret: string | null | undefined;
  headers: SvixHeaders;
  body: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const key = secretKey(input.secret ?? "");
  const { id, timestamp, signature } = input.headers;
  if (!key || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > (input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS)) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.body}`).digest();
  return signature
    .split(" ")
    .map((entry) => entry.trim())
    .some((entry) => {
      const [version, value] = entry.split(",", 2);
      if (version !== "v1" || !value) return false;
      const given = Buffer.from(value, "base64");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

const tagsSchema = z
  .union([z.record(z.string(), z.unknown()), z.array(z.object({ name: z.string(), value: z.unknown() }))])
  .optional()
  .transform((tags): Record<string, string> => {
    if (!tags) return {};
    const entries = Array.isArray(tags) ? tags.map((tag) => [tag.name, tag.value] as const) : Object.entries(tags);
    return Object.fromEntries(entries.filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([k, v]) => [k, v.slice(0, 256)]));
  });

const payloadSchema = z.object({
  type: z.string().max(100),
  created_at: z.string().max(64).optional(),
  data: z
    .object({
      email_id: z.string().max(200).optional(),
      to: z.union([z.string().max(320), z.array(z.string().max(320)).max(50)]).optional(),
      tags: tagsSchema,
      bounce: z.object({ message: z.string().max(2000).optional(), type: z.string().max(100).optional(), subType: z.string().max(100).optional() }).partial().optional(),
    })
    .passthrough(),
});

const KINDS: Record<string, EmailEvent["kind"]> = {
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivered": "delivered",
};

/** The event we act on, or null for events we ignore (opened, clicked, delivery_delayed…) or bad JSON. */
export function parseResendEvent(body: string): EmailEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const kind = KINDS[parsed.data.type];
  if (!kind) return null;
  const { data } = parsed.data;
  const to = (Array.isArray(data.to) ? data.to : data.to ? [data.to] : []).map((address) => address.trim().toLowerCase()).filter(Boolean);
  const at = parsed.data.created_at ? new Date(parsed.data.created_at) : undefined;
  const bounce = data.bounce ? [data.bounce.type, data.bounce.subType, data.bounce.message].filter(Boolean).join(" · ") : null;
  return {
    kind,
    emailId: data.email_id ?? null,
    to,
    tags: data.tags,
    detail: bounce || null,
    at: at && !Number.isNaN(at.getTime()) ? at : undefined,
  };
}
