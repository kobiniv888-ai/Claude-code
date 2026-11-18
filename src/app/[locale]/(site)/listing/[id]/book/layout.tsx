import type { ReactNode } from "react";
import { HideFooter } from "@/components/layout/hide-footer";
import { RouteMessages } from "@/i18n/route-messages";

/**
 * The booking review page's client text (booking, phone check), on top of the listing route's.
 * The booking flow has no site footer (round 3).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RouteMessages route="listing/[id]/book">
      <HideFooter />
      {children}
    </RouteMessages>
  );
}
