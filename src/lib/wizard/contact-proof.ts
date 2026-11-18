import type { ListingStatus } from "@/generated/prisma/enums";
import { maskPhoneLast2, looksLikePhone } from "@/lib/admin/staff-visibility";
import type { SavableStepKey } from "./steps";

/**
 * A fresh code before a listing's guest-facing contact details change (SECURITY_REPORT 3.6.a,
 * 14.3.b; pure). A never-published DRAFT is free to edit; once a listing was submitted (live,
 * paused, in review, rejected, expired…) a change of its contact channels needs a code entered in
 * this session in the last 5 minutes (src/lib/auth/fresh-proof.ts), which the change then spends,
 * and the host gets a "contact details changed — if this wasn't you" notice.
 */
export function contactChangeNeedsProof(step: SavableStepKey, status: ListingStatus, contactMethodsChanged: boolean): boolean {
  return step === "contact" && status !== "DRAFT" && contactMethodsChanged;
}

/** The new contact channels for the notice, masked ("WHATSAPP ••• ••• ••45, TELEGRAM @da***"). */
export function maskedContactSummary(methods: readonly { channel: string; value: string }[]): string | null {
  const parts = methods
    .filter((m) => m.value?.trim())
    .slice(0, 6)
    .map((m) => {
      const value = m.value.trim();
      if (looksLikePhone(value)) return `${m.channel} ${maskPhoneLast2(value) ?? "•••"}`;
      return `${m.channel} ${value.slice(0, Math.min(3, Math.max(1, value.length - 2)))}***`;
    });
  return parts.length ? parts.join(", ") : null;
}
