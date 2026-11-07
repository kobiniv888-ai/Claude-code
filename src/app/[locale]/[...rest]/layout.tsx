import type { ReactNode } from "react";
import { SiteShell } from "@/components/layout/site-shell";
import { RouteMessages } from "@/i18n/route-messages";

/**
 * Unknown addresses (/he/does-not-exist/…) get the public site's frame, like the (site) pages, so
 * that ./not-found.tsx shows the designed 404 inside the header and footer. (The frame is not in
 * app/[locale]/not-found.tsx, which is sent with every page; see that file.)
 */
export default function UnknownAddressLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell>
      <RouteMessages route="site">{children}</RouteMessages>
    </SiteShell>
  );
}
