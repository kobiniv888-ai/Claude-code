"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, FlagIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { errorMessageKey } from "@/lib/errors";
import { REPORT_REASONS } from "@/lib/listing/fields";
import { createReport } from "@/lib/reports/actions";
import { REPORT_DETAILS_MAX, REPORT_OTHER_MIN, type ReportReasonKey, type ReportTargetKey } from "@/lib/reports/schemas";
import { cn } from "@/lib/utils";

/**
 * "Report listing" / "Report profile": a signed-in user picks a reason and may add details.
 * Signed-out visitors log in first (in place), then the dialog opens.
 *
 * Import <ReportButton> from ./report-dialog, which loads this module when the button comes near
 * the screen (the form's checks and Radix dialog are not part of the page's first load).
 */
export type ReportButtonProps = {
  targetType: ReportTargetKey;
  targetId: string;
  variant?: "link" | "outline";
  className?: string;
};

export function ReportButton({ targetType, targetId, variant = "link", className }: ReportButtonProps) {
  const t = useTranslations("report");
  const te = useTranslations("errors");
  const requireLogin = useRequireLogin();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReasonKey | "">("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const label = targetType === "LISTING" ? t("reportListing") : t("reportProfile");

  const start = () => {
    void requireLogin(() => {
      setReason("");
      setDetails("");
      setError(null);
      setDone(false);
      setOpen(true);
    });
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!reason) {
      setError(t("errors.reason"));
      return;
    }
    if (reason === "OTHER" && details.trim().length < REPORT_OTHER_MIN) {
      setError(t("errors.details", { count: REPORT_OTHER_MIN }));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await createReport({ targetType, targetId, reason, details, turnstileToken: token });
      if (result.ok) {
        setDone(true);
        return;
      }
      // Turnstile tokens are single-use.
      captcha.current?.reset();
      if (result.error === "already_reported") {
        setOpen(false);
        toast.message(t("errors.already_reported"));
        return;
      }
      setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}` as never) : te(errorMessageKey(result.error)));
    } catch {
      captcha.current?.reset();
      setError(te("network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant === "link" ? "ghost" : "outline"}
        className={cn(variant === "link" ? "h-auto gap-1.5 px-1 py-1 text-sm text-muted-foreground hover:text-destructive" : "h-11 rounded-xl", className)}
        onClick={start}
      >
        <FlagIcon className="size-4" aria-hidden />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader className="text-start">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{targetType === "LISTING" ? t("listingIntro") : t("profileIntro")}</DialogDescription>
          </DialogHeader>
          {done ? (
            <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2Icon className="size-12 text-verified" aria-hidden />
              <p className="font-semibold">{t("thanksTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("thanks")}</p>
              <Button type="button" variant="outline" className="mt-2 h-11 rounded-xl" onClick={() => setOpen(false)}>
                {t("close")}
              </Button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={onSubmit} noValidate>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">{t("reasonLabel")}</legend>
                <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReasonKey)} className="grid gap-1">
                  {REPORT_REASONS.map((key) => (
                    <Label
                      key={key}
                      htmlFor={`${id}-${key}`}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary/60"
                    >
                      <RadioGroupItem id={`${id}-${key}`} value={key} />
                      <span>{t(`reasons.${key}`)}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-details`}>{reason === "OTHER" ? t("detailsRequired") : t("detailsOptional")}</Label>
                <Textarea
                  id={`${id}-details`}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={4}
                  maxLength={REPORT_DETAILS_MAX}
                  dir="auto"
                  placeholder={t("detailsPlaceholder")}
                />
              </div>
              <Turnstile ref={captcha} action="report" onToken={setToken} onExpire={() => setToken(null)} />
              {error ? (
                <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" variant="destructive" className="h-11 w-full rounded-xl sm:w-auto" disabled={pending}>
                  {pending ? t("sending") : t("submit")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
