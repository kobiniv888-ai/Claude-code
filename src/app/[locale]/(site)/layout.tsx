import type { ReactNode } from "react";
import { SiteShell } from "@/components/layout/site-shell";

/** Every public page: notices, header, footer, phone bottom bar and cookie banner. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
