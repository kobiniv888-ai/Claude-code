"use server";

import { cookies } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action";
import { CURRENCY_COOKIE_NAME, CURRENCY_COOKIE_MAX_AGE } from "./cookie";
import { isEnabledCurrency } from "./convert";
import { rateLimitByIp } from "@/lib/rate-limit";

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
