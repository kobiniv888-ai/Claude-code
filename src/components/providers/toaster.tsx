"use client";

import { useTranslations } from "next-intl";
import { Toaster } from "@/components/ui/sonner";

/**
 * Toast notifications (sonner). Toasts appear on the end side (right in English, left in
 * Hebrew/Arabic) and, on phones, above the bottom navigation bar.
 */
export function AppToaster({ dir }: { dir: "ltr" | "rtl" }) {
  const t = useTranslations("common");
  return (
    <Toaster
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      closeButton
      containerAriaLabel={t("notifications")}
      mobileOffset={{ bottom: "calc(var(--bottom-nav-height, 0px) + 12px)" }}
      toastOptions={{ closeButtonAriaLabel: t("close"), classNames: { toast: "cn-toast rounded-xl! shadow-float!" } }}
    />
  );
}
