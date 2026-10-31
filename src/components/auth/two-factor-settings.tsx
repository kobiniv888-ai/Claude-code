"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon, LockKeyholeIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { disableTotp } from "@/lib/auth/actions";
import { withNext } from "@/lib/auth/next-path";
import { cn } from "@/lib/utils";
import { CodeInput } from "./code-input";
import { useAuthErrorMessage } from "./use-auth-messages";

/**
 * 2-step login card for the account settings page.
 *
 *   const user = await requireUser();
 *   <TwoFactorSettings enabled={user.twoFactorEnabled} isStaff={user.isStaff} />
 */
export function TwoFactorSettings({
  enabled,
  isStaff,
  returnTo = "/account/settings",
  className,
}: {
  enabled: boolean;
  isStaff: boolean;
  /** Where the setup page sends the user back to. */
  returnTo?: string;
  className?: string;
}) {
  const t = useTranslations("auth.settings");
  const errorMessage = useAuthErrorMessage();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function turnOff(value: string) {
    if (pending || value.length !== 6) return;
    setPending(true);
    setError(null);
    const result = await disableTotp({ code: value }).catch(() => null);
    setPending(false);
    if (!result?.ok) {
      setCode("");
      setError(result ? result.error : "network");
      return;
    }
    setOpen(false);
    setCode("");
    setStatus(t("disabled"));
    router.refresh();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void turnOff(code);
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6", className)}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            enabled ? "bg-verified-soft text-verified" : "bg-muted text-muted-foreground",
          )}
        >
          {enabled ? <ShieldCheckIcon className="size-5" aria-hidden /> : <ShieldIcon className="size-5" aria-hidden />}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-title`} className="text-base font-semibold">
              {t("title")}
            </h2>
            <Badge
              variant="secondary"
              className={cn(enabled ? "bg-verified-soft text-verified" : "bg-muted text-muted-foreground")}
            >
              {enabled ? t("statusOn") : t("statusOff")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{enabled ? t("descriptionOn") : t("descriptionOff")}</p>
          {enabled && isStaff && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyholeIcon className="size-3.5" aria-hidden />
              {t("staffNote")}
            </p>
          )}
          {status && (
            <p role="status" className="text-sm text-verified">
              {status}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        {!enabled ? (
          <Button asChild className="h-10 rounded-xl px-4">
            <Link href={withNext("/two-factor/setup", returnTo)}>{t("enable")}</Link>
          </Button>
        ) : (
          !isStaff && (
            <Button
              variant="outline"
              className="h-10 rounded-xl px-4"
              onClick={() => {
                setStatus(null);
                setError(null);
                setCode("");
                setOpen(true);
              }}
            >
              {t("disable")}
            </Button>
          )
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-md sm:p-6" showCloseButton={false}>
          <form onSubmit={onSubmit} noValidate className="grid gap-5">
            <DialogHeader className="text-start">
              <DialogTitle className="text-lg font-semibold">{t("disableTitle")}</DialogTitle>
              <DialogDescription id={`${id}-help`}>{t("disableText")}</DialogDescription>
            </DialogHeader>
            <CodeInput
              id={`${id}-code`}
              label={t("codeLabel")}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (error) setError(null);
              }}
              onComplete={(value) => void turnOff(value)}
              disabled={pending}
              invalid={!!error}
              autoFocus
              describedBy={[`${id}-help`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
            />
            {error && (
              <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
                {errorMessage(error)}
              </p>
            )}
            <DialogFooter className="-mx-5 -mb-5 rounded-b-2xl sm:-mx-6 sm:-mb-6">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="h-10 rounded-xl px-4">
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                className="h-10 rounded-xl px-4"
                disabled={pending || code.length !== 6}
                aria-busy={pending || undefined}
              >
                {pending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
                {t("disableConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
