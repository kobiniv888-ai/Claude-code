"use server";

/**
 * Server actions for saved searches and the alert switches (round 3, brief 7.4). Each one checks
 * the session, validates its input with zod, is rate-limited per account and only touches the
 * signed-in user's own rows (./server.ts takes the user's id).
 *
 * Saving needs an account: a signed-out visitor gets "auth_required" (the button opens the
 * sign-in sheet first, then saves).
 */
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { setEmailSwitch } from "@/lib/alerts/unsubscribe-server";
import { requireUserForAction } from "@/lib/auth/session";
import { getDisplayCurrency } from "@/lib/currency";
import { assertRateLimit } from "@/lib/rate-limit";
import { validateSearchName } from "./core";
import { alertEmailSwitches, createSavedSearch, deleteSavedSearch, renameSavedSearch, setSavedSearchActive } from "./server";

const idInput = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const nameInput = z.string().max(400);
const queryInput = z.string().max(4000);

const WRITE_LIMIT = { limit: 30, windowSeconds: 3600 };
const SWITCH_LIMIT = { limit: 60, windowSeconds: 3600 };

const saveSchema = z.object({ query: queryInput, name: nameInput });

export type SaveSearchResult = {
  id: string;
  /** "exists": this search was saved before (nothing new; resumed if it was paused). */
  status: "created" | "exists";
  name: string;
  /** The saved-search emails are switched on (otherwise the toast says where to turn them on). */
  emailsOn: boolean;
};

/** "שמירת חיפוש": saves the results page's search under a name. */
export async function saveSearchAction(input: unknown): Promise<ActionResult<SaveSearchResult>> {
  return runAction<SaveSearchResult>(async () => {
    const user = await requireUserForAction();
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const name = validateSearchName(parsed.data.name);
    if (!name.ok) return fail(name.error);
    await assertRateLimit(`saved-search:write:${user.id}`, WRITE_LIMIT);
    // The price range was typed in the visitor's display currency (the same rule as the page).
    const locale = await getLocale();
    const currency = await getDisplayCurrency(user.currency, isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale);
    const result = await createSavedSearch(user.id, { query: parsed.data.query.replace(/^\?/, ""), currency, name: name.name });
    if (result.kind === "limit") return fail("too_many_searches");
    const switches = await alertEmailSwitches(user.id);
    return ok({
      id: result.id,
      status: result.kind,
      name: result.kind === "exists" ? result.name : name.name,
      emailsOn: switches.savedSearches,
    });
  });
}

export async function renameSavedSearchAction(input: unknown): Promise<ActionResult<{ name: string }>> {
  return runAction<{ name: string }>(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ id: idInput, name: nameInput }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const name = validateSearchName(parsed.data.name);
    if (!name.ok) return fail(name.error);
    await assertRateLimit(`saved-search:write:${user.id}`, WRITE_LIMIT);
    if (!(await renameSavedSearch(user.id, parsed.data.id, name.name))) return fail("not_found");
    return ok({ name: name.name });
  });
}

/** Pause (no emails) or resume (from now on). */
export async function setSavedSearchActiveAction(input: unknown): Promise<ActionResult<{ active: boolean }>> {
  return runAction<{ active: boolean }>(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ id: idInput, active: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`saved-search:switch:${user.id}`, SWITCH_LIMIT);
    if (!(await setSavedSearchActive(user.id, parsed.data.id, parsed.data.active))) return fail("not_found");
    return ok({ active: parsed.data.active });
  });
}

export async function deleteSavedSearchAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ id: idInput }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`saved-search:write:${user.id}`, WRITE_LIMIT);
    if (!(await deleteSavedSearch(user.id, parsed.data.id))) return fail("not_found");
    return ok();
  });
}

/** The two switches of /account/alerts: the saved-search emails and the price-drop emails. */
export async function setAlertEmailAction(input: unknown): Promise<ActionResult<{ on: boolean }>> {
  return runAction<{ on: boolean }>(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ kind: z.enum(["savedSearches", "priceDrops"]), on: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`saved-search:switch:${user.id}`, SWITCH_LIMIT);
    if (!(await setEmailSwitch(user.id, parsed.data.kind, parsed.data.on))) return fail("not_found");
    return ok({ on: parsed.data.on });
  });
}
