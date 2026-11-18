"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircleIcon, LogOutIcon } from "lucide-react";
import { getPathname } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * "התנתקות" (round 3, bug 2.9): signs out, clears this device's private data and opens the home
 * page with a short "התנתקתם" (src/lib/auth/logout.ts). Used at the bottom of /account and in the
 * side menu; the desktop account menu calls the same helper.
 *
 *   <LogoutButton className={buttonStyles({ variant: "outline" })} />
 */
export function LogoutButton({ className, onDone }: { className?: string; onDone?: () => void }) {
  const t = useTranslations("auth.menu");
  const locale = useLocale();
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const { logOut } = await import("@/lib/auth/logout");
    const result = await logOut({ homeHref: getPathname({ href: "/", locale }) });
    if (!result.ok) {
      setPending(false);
      toast.error(t("logoutError"));
      return;
    }
    onDone?.();
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn("inline-flex items-center gap-2", className)}
    >
      {pending ? (
        <LoaderCircleIcon className="size-5 shrink-0 animate-spin" aria-hidden />
      ) : (
        <LogOutIcon className="size-5 shrink-0 rtl:-scale-x-100" aria-hidden />
      )}
      {pending ? t("loggingOut") : t("logout")}
    </button>
  );
}
