"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

/** sonner (~13 KB gzip) loads after the page has started instead of with it; see @/lib/toast. */
const SonnerToaster = dynamic(() => import("./sonner-toaster"), { ssr: false });

/**
 * Toast notifications (sonner). Toasts appear on the end side (right in English, left in
 * Hebrew/Arabic) and, on phones, above the bottom navigation bar.
 */
export function AppToaster({ dir }: { dir: "ltr" | "rtl" }) {
  const t = useTranslations("common");
  const tMenu = useTranslations("auth.menu");
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
      loggedOutMessage={tMenu("loggedOut")}
    />
  );
}
