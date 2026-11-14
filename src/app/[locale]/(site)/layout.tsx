import type { ReactNode } from "react";
import { SiteShell } from "@/components/layout/site-shell";
import { RouteMessages } from "@/i18n/route-messages";

/**
 * Every public page: notices, header, footer, phone bottom bar and cookie banner. The pages get
 * the listing card's and the search bar's interface text (src/i18n/client-messages.ts).
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell>
      <RouteMessages route="site">{children}</RouteMessages>
    </SiteShell>
  );
}
