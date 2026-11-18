"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarXIcon, UserXIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cancelBookingAsHostAction, reportNoShowAction } from "@/lib/booking/actions";
import { CANCEL_REASON_TEXT_MAX, HOST_CANCEL_REASONS, REASONS_NEEDING_TEXT, type HostCancelReason } from "@/lib/booking/constants";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function useErrorText() {
  const tb = useTranslations("booking.errors");
  const te = useTranslations("errors");
  return (code: string) => (tb.has(code) ? tb(code) : te.has(code) ? te(code) : te("server_error"));
}

const SHEET_BODY = "grid gap-4 px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]";

/**
 * The host's actions on one booking: cancel (only with a reason: double booking, a problem with
 * the place, or other + text; every host cancellation is logged and early ones are reviewed) and
 * "לא הגיע" (no-show, from the day after check-in; logged).
 */
export function HostBookingActions({
  bookingId,
  guestName,
  canCancel,
  canReportNoShow,
}: {
  bookingId: string;
  guestName: string;
  canCancel: boolean;
  canReportNoShow: boolean;
}) {
  const t = useTranslations("hostBooking.actions");
  const tb = useTranslations("booking");
  const errorText = useErrorText();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState<"cancel" | "noShow" | null>(null);
  const [reason, setReason] = useState<HostCancelReason | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!canCancel && !canReportNoShow) return null;
  const needsText = reason !== null && REASONS_NEEDING_TEXT.includes(reason);

  const close = () => {
    setOpen(null);
    setError(null);
  };

  const cancel = async () => {
    if (!reason) {
      setError(tb("errors.reason_required"));
      return;
    }
    if (needsText && !text.trim()) {
      setError(tb("errors.reason_text_required"));
      return;
    }
    setPending(true);
    const result = await cancelBookingAsHostAction({ bookingId, reasonCode: reason, reasonText: text }).catch(() => null);
    setPending(false);
    if (result?.ok) {
      close();
      toast.success(t("cancelled"));
      router.refresh();
    } else {
      setError(errorText(result?.error ?? "server_error"));
    }
  };

  const reportNoShow = async () => {
    setPending(true);
    const result = await reportNoShowAction({ bookingId }).catch(() => null);
    setPending(false);
    if (result?.ok) {
      close();
      toast.success(t("noShowReported"));
      router.refresh();
    } else {
      setError(errorText(result?.error ?? "server_error"));
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canReportNoShow && (
        <Button type="button" variant="outline" className="min-w-0 flex-1 shrink sm:flex-none" onClick={() => setOpen("noShow")}>
          <UserXIcon aria-hidden />
          <span className="truncate">{t("noShow")}</span>
        </Button>
      )}
      {canCancel && (
        <Button type="button" variant="outline" className="min-w-0 flex-1 shrink sm:flex-none" onClick={() => setOpen("cancel")}>
          <CalendarXIcon aria-hidden />
          <span className="truncate">{t("cancel")}</span>
        </Button>
      )}

      <BottomSheet
        open={open === "cancel"}
        onOpenChange={(value) => !value && close()}
        title={t("cancelTitle")}
        description={t("cancelLead")}
        footer={
          <div className="flex gap-2 px-4 py-3">
            <Button type="button" variant="outline" className="min-w-0 flex-1 shrink" onClick={close} disabled={pending}>
              {t("keep")}
            </Button>
            <Button type="button" className="min-w-0 flex-1 shrink" onClick={() => void cancel()} disabled={pending}>
              {pending ? t("working") : t("cancelConfirm")}
            </Button>
          </div>
        }
      >
        <div className={SHEET_BODY}>
          <fieldset className="grid gap-2" aria-describedby={error ? `${id}-error` : undefined}>
            <legend className="mb-2 text-body font-semibold">{t("reasonLegend")}</legend>
            {HOST_CANCEL_REASONS.map((code) => (
              <label
                key={code}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  reason === code ? "border-primary bg-primary-tint" : "border-border-strong bg-card hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-reason`}
                  value={code}
                  checked={reason === code}
                  onChange={() => {
                    setReason(code);
                    setError(null);
                  }}
                  className="size-5 accent-primary"
                />
                <span className="text-body">{tb(`hostReason.${code}`)}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-2">
            <label htmlFor={`${id}-text`} className="text-small font-semibold">
              {needsText ? t("reasonTextRequired") : t("reasonTextOptional")}
            </label>
            <Textarea
              id={`${id}-text`}
              value={text}
              maxLength={CANCEL_REASON_TEXT_MAX}
              rows={3}
              dir="auto"
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              className="text-base"
            />
          </div>
          <p className="rounded-xl bg-surface-muted p-3 text-small text-pretty">{t("cancelWarning")}</p>
          {error && (
            <p id={`${id}-error`} role="alert" className="text-small font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={open === "noShow"}
        onOpenChange={(value) => !value && close()}
        title={t("noShowTitle")}
        footer={
          <div className="flex gap-2 px-4 py-3">
            <Button type="button" variant="outline" className="min-w-0 flex-1 shrink" onClick={close} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" className="min-w-0 flex-1 shrink" onClick={() => void reportNoShow()} disabled={pending}>
              {pending ? t("working") : t("noShowConfirm")}
            </Button>
          </div>
        }
      >
        <div className={SHEET_BODY}>
          <p className="text-body text-pretty">{t("noShowBody", { name: guestName })}</p>
          <p className="text-small text-pretty text-muted-foreground">{t("noShowNote")}</p>
          {error && (
            <p role="alert" className="text-small font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
