/**
 * Admin → Email outbox "send again" (round 3, brief 9): an email that was only kept in the outbox
 * (status LOGGED, because Resend was not set up yet) can be sent for real once it is. Pure and
 * client-safe; src/lib/admin/actions/outbox.ts applies it.
 *
 * Never sent again: emails that were already sent or failed, the demo accounts' emails (provider
 * "outbox": their addresses are made up), login codes (masked in the outbox and expired anyway),
 * and addresses that cannot receive mail (phone-only placeholders, the founder-alert stand-in).
 */

export type ResendBlock = "not_configured" | "not_logged" | "outbox_only" | "login_code" | "bad_address";

const UNDELIVERABLE = /@(phone\.bayit\.invalid|outbox\.invalid)$|\.invalid$/i;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function resendBlock(
  row: { status: string; provider: string | null; template: string; to: string },
  resendConfigured: boolean,
): ResendBlock | null {
  if (!resendConfigured) return "not_configured";
  if (row.status !== "LOGGED") return "not_logged";
  if (row.provider === "outbox") return "outbox_only";
  if (row.template === "login_code") return "login_code";
  const to = row.to.trim();
  if (!EMAIL.test(to) || to.length > 254 || UNDELIVERABLE.test(to)) return "bad_address";
  return null;
}
