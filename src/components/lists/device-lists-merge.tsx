"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { mergeDeviceListsIntoAccount } from "@/lib/lists/merge-client";
import { toast } from "@/lib/toast";

/**
 * On the signed-in saved page: lists this device kept while signed out go into the account
 * (no duplicates, the account wins), then the page reloads its lists. Renders nothing.
 */
export function DeviceListsMerge() {
  const t = useTranslations("lists.page");
  const router = useRouter();
  useEffect(() => {
    void mergeDeviceListsIntoAccount().then((outcome) => {
      if (outcome !== "merged") return;
      toast.success(t("merged"));
      router.refresh();
    });
  }, [router, t]);
  return null;
}
