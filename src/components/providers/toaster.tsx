"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { hasLoggedOutFlag } from "@/lib/auth/device-data";
import { afterLoadIdle } from "@/lib/idle";
import { whenToastWanted } from "@/lib/toast";

/**
 * sonner (~13 KB gzip) loads once the page has settled (the first touch or a quiet start, then
 * an idle moment) instead of right after it starts, or at once for a toast that comes earlier
 * (and for the "logged out" message after a logout); see @/lib/toast.
 */
const SonnerToaster = dynamic(() => import("./sonner-toaster"), { ssr: false });

/**
 * Toast notifications (sonner). Toasts appear on the end side (right in English, left in
 * Hebrew/Arabic) and, on phones, above the bottom navigation bar.
 */
export function AppToaster({ dir }: { dir: "ltr" | "rtl" }) {
  const t = useTranslations("common");
  const tMenu = useTranslations("auth.menu");
  // "afterLogout": this page was opened by a logout (src/lib/auth/logout.ts) and says so once. Read
  // at the start only: a logout made on this page sets the flag for the page it goes to, and sonner
  // mounting here in the meantime (the logout tap counts as the first touch) must not take it.
  const [state, setState] = useState<"waiting" | "mounted" | "afterLogout">("waiting");
  useEffect(() => {
    const mount = () => setState((current) => (current === "waiting" ? "mounted" : current));
    const mountAfterLogout = () => setState("afterLogout");
    if (hasLoggedOutFlag()) {
      mountAfterLogout();
      return;
    }
    const stopWaiting = whenToastWanted(mount);
    const cancelIdle = afterLoadIdle(mount);
    return () => {
      stopWaiting();
      cancelIdle();
    };
  }, []);
  if (state === "waiting") return null;
  return (
    <SonnerToaster
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      closeButton
      containerAriaLabel={t("notifications")}
      mobileOffset={{ bottom: "calc(var(--bottom-nav-height, 0px) + 12px)" }}
      toastOptions={{
        closeButtonAriaLabel: t("close"),
        // The action ("לתיקון", "לשמורים") is a real button on a phone: 44 px tall, not sonner's 24.
        classNames: { toast: "cn-toast rounded-xl! shadow-float!", actionButton: "h-auto! min-h-11! rounded-lg! px-3! text-sm! font-semibold!" },
      }}
      loggedOutMessage={state === "afterLogout" ? tMenu("loggedOut") : undefined}
    />
  );
}
