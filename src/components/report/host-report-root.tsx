"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { registerHostReportRoot } from "./host-report-store";
import type { TurnedAwayLauncherProps } from "./turned-away-launcher";

const Launcher = dynamic<TurnedAwayLauncherProps>(() => import("./turned-away-launcher"), { ssr: false });

/**
 * The listing page's "Report the host" (brief 8.2): renders nothing until a "…" menu item or the
 * host card's link asks for it (requestHostReport), then loads the form. Mount it once, only on a
 * public listing that is not the visitor's own.
 */
export function HostReportRoot({ listingId, listingTitle, today }: { listingId: string; listingTitle: string; today: string }) {
  const [request, setRequest] = useState(0);
  useEffect(() => registerHostReportRoot(() => setRequest((n) => n + 1)), []);
  if (request === 0) return null;
  return <Launcher request={request} target={{ listingId }} context={{ listingTitle }} today={today} />;
}
