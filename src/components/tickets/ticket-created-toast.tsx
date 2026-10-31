"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * After "Open a ticket" redirects here with ?created=1: one success toast, then the flag is
 * removed from the address (through the router, so it sticks after the redirect) and a reload
 * or a shared link does not show it again.
 */
export function TicketCreatedToast({ number }: { number: number }) {
  const t = useTranslations("tickets.detail");
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.success(t("createdToast", { number: String(number) }), { description: t("createdToastBody") });
    router.replace(pathname, { scroll: false });
  }, [number, pathname, router, t]);

  return null;
}
