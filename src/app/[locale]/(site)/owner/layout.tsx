import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/route-messages";

/** Sends this route's client interface text to the browser (src/i18n/client-messages.ts). */
export default function Layout({ children }: { children: ReactNode }) {
  return <RouteMessages route="owner">{children}</RouteMessages>;
}
