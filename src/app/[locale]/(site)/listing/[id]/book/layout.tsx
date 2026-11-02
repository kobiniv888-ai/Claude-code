import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/route-messages";

/** The booking review page's client text (booking, phone check), on top of the listing route's. */
export default function Layout({ children }: { children: ReactNode }) {
  return <RouteMessages route="listing/[id]/book">{children}</RouteMessages>;
}
