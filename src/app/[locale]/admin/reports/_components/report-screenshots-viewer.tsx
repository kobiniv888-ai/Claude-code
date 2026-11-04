"use client";

import { Eye, ImageIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { reportAttachmentUrl } from "@/lib/reports/turned-away";

/**
 * A report's screenshots, for staff with the "reports" permission (brief 8.2). Hidden until staff
 * choose to look: the images come from the staff-only route, which writes each opening to the
 * audit log. Each opens full size in a new tab (same route, no caching).
 */
export function ReportScreenshotsViewer({ reportId, count }: { reportId: string; count: number }) {
  const t = useTranslations("admin.reports.screenshots");
  const locale = useLocale();
  const [shown, setShown] = useState(false);
  if (!shown) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setShown(true)}>
          <Eye aria-hidden />
          {t("show", { count })}
        </Button>
        <p className="text-xs text-muted-foreground">{t("privacy")}</p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, index) => {
        const url = reportAttachmentUrl(reportId, index);
        const label = t("alt", { number: formatNumber(index + 1, locale), count: formatNumber(count, locale) });
        return (
          <li key={index}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block aspect-[3/4] overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ImageIcon aria-hidden className="absolute inset-0 m-auto size-6 text-muted-foreground" />
              {/* A private image from the staff-only route (no next/image: it must never be cached or resized by a shared service). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={label} loading="lazy" className="relative size-full object-cover object-top transition-opacity group-hover:opacity-90" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
