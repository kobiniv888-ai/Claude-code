"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircleIcon, LogOutIcon, MonitorSmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getPathname } from "@/i18n/navigation";
import { toast } from "@/lib/toast";

/**
 * Settings → security: "התנתקות מכל המכשירים" (round 3, bug 2.9). Ends every session of the
 * account, this one too, after a confirmation; then this device is cleared and the home page opens
 * (src/lib/auth/logout.ts). Staff use is in the audit log.
 */
export function LogoutEverywhere() {
  const t = useTranslations("account.settings.logoutAll");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const { logOut } = await import("@/lib/auth/logout");
    const result = await logOut({ homeHref: getPathname({ href: "/", locale }), everywhere: true });
    if (result.ok) return; // the page is leaving
    setPending(false);
    toast.error(result.error === "rate_limited" ? t("rateLimited") : t("error"));
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-3 text-sm text-muted-foreground">
        <MonitorSmartphoneIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <span>{t("what")}</span>
      </p>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="h-11 w-full shrink-0 rounded-xl px-5 sm:w-fit">
            <LogOutIcon className="rtl:-scale-x-100" aria-hidden />
            {t("button")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dialogBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button type="button" onClick={() => void run()} disabled={pending} aria-busy={pending || undefined}>
              {pending ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden />
              ) : (
                <LogOutIcon className="rtl:-scale-x-100" aria-hidden />
              )}
              {pending ? t("pending") : t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
