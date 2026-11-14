"use client";

import { useTranslations } from "next-intl";
import { FlagIcon } from "lucide-react";
import { requestHostReport } from "./host-report-store";

/**
 * "Report the host" under the host card (computers have no "…" bar). Render it only next to
 * <HostReportRoot> (public listings that are not the visitor's own).
 */
export function HostReportLink() {
  const t = useTranslations("report.turnedAway");
  return (
    <button
      type="button"
      onClick={requestHostReport}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <FlagIcon className="size-4" aria-hidden />
      {t("menuItem")}
    </button>
  );
}
