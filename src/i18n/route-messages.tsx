import type { ReactNode } from "react";
import { getMessages } from "next-intl/server";
import { MergeMessages } from "./merge-messages";
import {
  ROUTE_MESSAGES,
  SHELL_MESSAGES,
  SITE_MESSAGES,
  pickMessages,
  withoutCovered,
  type MessageRoute,
} from "./client-messages";

/**
 * Server component for a route layout: sends that route's extra client messages
 * (`ROUTE_MESSAGES[route]`, or `SITE_MESSAGES` for the (site) layout) to the browser, on top of the
 * root layout's shell set. See src/i18n/client-messages.ts.
 */
export async function RouteMessages({ route, children }: { route: MessageRoute | "site"; children: ReactNode }) {
  const messages = await getMessages();
  const covered: readonly string[] = route === "site" ? SHELL_MESSAGES : [...SHELL_MESSAGES, ...SITE_MESSAGES];
  const paths = withoutCovered(route === "site" ? SITE_MESSAGES : ROUTE_MESSAGES[route], covered);
  if (paths.length === 0) return children;
  return <MergeMessages messages={pickMessages(messages, paths)}>{children}</MergeMessages>;
}
