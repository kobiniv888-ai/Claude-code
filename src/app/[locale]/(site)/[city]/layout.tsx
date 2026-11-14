import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/route-messages";

/** Sends the city pages' client interface text (their lazy map) to the browser (src/i18n/client-messages.ts). */
export default function Layout({ children }: { children: ReactNode }) {
  return <RouteMessages route="[city]">{children}</RouteMessages>;
}
