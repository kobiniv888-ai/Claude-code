"use client";

import { deferredIsland } from "@/components/ds/deferred-island";
import { HOME_HISTORY_ATTR } from "@/lib/home/history-hint";
import { afterLoadIdle } from "@/lib/idle";
import type { ContinueBlock } from "./continue-block";

/** Set by ContinueSection on its wrapper when the signed-in account has places to show. */
export const CONTINUE_ACCOUNT_ATTR = "data-continue-account";

/**
 * True when "המשך מאיפה שעצרתם" will show something: this device has history (the page's inline
 * hint, src/lib/home/history-hint.ts) or the account has (the server's marker). Client-only.
 */
export function continueBlockExpected(): boolean {
  return document.documentElement.hasAttribute(HOME_HISTORY_ATTR) || document.querySelector(`[${CONTINUE_ACCOUNT_ATTR}]`) !== null;
}

/**
 * "המשך מאיפה שעצרתם", rendered on the server as before (its reserved space), but its code (the
 * history stores, the recently viewed list, the server actions) is not part of the home page's
 * first load: it loads at once for a returning visitor (who sees the block), and for a first
 * visit — who sees nothing — only after the first interaction or once the page is idle.
 */
export const ContinueBlockIsland = deferredIsland<Parameters<typeof ContinueBlock>[0]>(
  () => (continueBlockExpected() ? Promise.resolve() : new Promise<void>((resolve) => void afterLoadIdle(resolve))),
  () => import("./continue-block").then((m) => m.ContinueBlock),
);
