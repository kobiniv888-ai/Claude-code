"use client";

import { deferredIsland, whenNearViewport } from "@/components/ds/deferred-island";
import type { ReportButtonProps } from "./report-dialog-impl";

/**
 * "Report listing" / "Report profile" (./report-dialog-impl). Rendered on the server as usual; its
 * code (the dialog, the reason list and the form checks) loads when a report button comes near
 * the screen or gets keyboard focus, so the listing and owner pages do not ship it up front.
 */
const LazyReportButton = deferredIsland<ReportButtonProps>(
  () => whenNearViewport("[data-report-button]"),
  () => import("./report-dialog-impl").then((m) => m.ReportButton),
  { scope: "[data-report-button]" },
);

export function ReportButton(props: ReportButtonProps) {
  return (
    <span data-report-button="" className="contents">
      <LazyReportButton {...props} />
    </span>
  );
}
