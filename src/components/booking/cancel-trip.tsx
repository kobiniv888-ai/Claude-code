"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarXIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cancelBookingAsGuestAction } from "@/lib/booking/actions";
import { CANCEL_REASON_TEXT_MAX, GUEST_CANCEL_REASONS, REASONS_NEEDING_TEXT, type GuestCancelReason } from "@/lib/booking/constants";
import { isBookingErrorCode } from "@/lib/booking/errors";
import { errorMessageKey } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * "Cancel booking" on the trip page: a sheet with the reason (required; "Other" needs a few words),
 * whether cancelling now is free or late (nothing is charged either way: guests pay on arrival),
 * then cancelBookingAsGuestAction. Text: `booking`.
 */
export function CancelTrip({ bookingId, late, freeLine }: { bookingId: string; late: boolean; freeLine: string | null }) {
  const t = useTranslations("booking");
  const te = useTranslations("errors");
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<GuestCancelReason | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsText = !!reason && REASONS_NEEDING_TEXT.includes(reason);

  const confirm = () => {
    if (!reason) return setError(t("errors.reason_required"));
    if (needsText && !text.trim()) return setError(t("errors.reason_text_required"));
    setError(null);
    startTransition(async () => {
      const result = await cancelBookingAsGuestAction({ bookingId, reasonCode: reason, reasonText: text }).catch(() => ({
        ok: false as const,
        error: "server_error",
      }));
      if (result.ok) {
        setOpen(false);
        toast.success(t("trip.cancelledToast"));
        router.refresh();
        // The button is gone after the refresh: put focus on the section's heading.
        window.setTimeout(() => document.getElementById("trip-cancel")?.focus(), 500);
        return;
      }
      setError(isBookingErrorCode(result.error) ? t(`errors.${result.error}`) : te(errorMessageKey(result.error)));
    });
  };

  return (
    <>
      <Button variant="secondary" className="justify-self-start" onClick={() => setOpen(true)}>
        <CalendarXIcon aria-hidden />
        {t("trip.cancel")}
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("trip.cancelSheetTitle")}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="min-w-0 flex-1 shrink" onClick={() => setOpen(false)} disabled={pending}>
              <span className="truncate">{t("trip.keep")}</span>
            </Button>
            <Button className="min-w-0 flex-1 shrink" onClick={confirm} disabled={pending} aria-busy={pending || undefined}>
              <span className="truncate">{pending ? t("trip.cancelling") : t("trip.cancel")}</span>
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <p className={cn("rounded-input px-3 py-2 text-small", late ? "bg-warning-soft" : "bg-surface-muted")}>
            {late ? t("policy.lateNote") : (freeLine ?? t("trip.freeNow"))}
          </p>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-body font-semibold">{t("trip.reason")}</legend>
            {GUEST_CANCEL_REASONS.map((code) => (
              <label
                key={code}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-input border px-3 py-2 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  reason === code ? "border-primary bg-primary-tint" : "border-border hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-reason`}
                  value={code}
                  checked={reason === code}
                  onChange={() => {
                    setReason(code);
                    setError(null);
                  }}
                  className="size-4 accent-(--primary)"
                />
                <span className="text-body">{t(`guestReason.${code}`)}</span>
              </label>
            ))}
          </fieldset>
          {reason === "HOST_ASKED" ? <p className="rounded-input bg-primary-tint px-3 py-2 text-small text-foreground">{t("trip.hostAskedNote")}</p> : null}
          <div className="grid gap-1.5">
            <label htmlFor={`${ids}-text`} className="text-small font-semibold">
              {needsText ? t("trip.reasonTextRequired") : t("trip.reasonText")}
            </label>
            <Textarea
              id={`${ids}-text`}
              dir="auto"
              rows={3}
              maxLength={CANCEL_REASON_TEXT_MAX}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-required={needsText || undefined}
              className="text-body"
            />
          </div>
          {error ? (
            <p role="alert" className="text-small text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}
