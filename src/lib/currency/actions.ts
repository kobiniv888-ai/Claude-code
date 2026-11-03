"use server";

import { cookies } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimitByIp } from "@/lib/rate-limit";
import { CURRENCY_COOKIE_NAME, CURRENCY_COOKIE_MAX_AGE } from "./cookie";
import { isEnabledCurrency } from "./convert";

/** Saves the visitor's display currency in a cookie for a year. */
export async function setDisplayCurrency(code: unknown): Promise<ActionResult> {
  if (!isEnabledCurrency(code)) return fail("invalid_input", { currency: ["invalid"] });

  const limit = await rateLimitByIp("currency:set", { limit: 30, windowSeconds: 60 });
  if (!limit.ok) return fail("rate_limited");

  (await cookies()).set(CURRENCY_COOKIE_NAME, code, {
    path: "/",
    maxAge: CURRENCY_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return ok();
}

/**
 * "Automatic (by language)" (round 3, bug 2.8): forgets the visitor's choice — the cookie, and the
 * account setting when signed in (User.currency = null) — so prices follow the page language again
 * (he/ru/ar ₪, en $, ka ₾). Only the caller's own cookie and own account row are touched.
 */
export async function clearDisplayCurrency(): Promise<ActionResult> {
  const limit = await rateLimitByIp("currency:set", { limit: 30, windowSeconds: 60 });
  if (!limit.ok) return fail("rate_limited");

  (await cookies()).delete(CURRENCY_COOKIE_NAME);
  const user = await getCurrentUser().catch(() => null);
  if (user?.currency) await db.user.update({ where: { id: user.id }, data: { currency: null } });
  return ok();
}
