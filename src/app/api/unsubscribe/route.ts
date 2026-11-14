import { NextResponse, type NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { setUnsubscribeSwitch } from "@/lib/alerts/unsubscribe-server";
import { verifyUnsubscribeToken } from "@/lib/alerts/unsubscribe-token";
import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";

/**
 * One-click unsubscribe (RFC 8058) for the List-Unsubscribe header of the weekly host digest
 * (src/lib/alerts/weekly-host-stats.ts) and the saved-search and price-drop emails
 * (src/lib/saved-searches/run.ts): the mail app POSTs "List-Unsubscribe=One-Click" to
 * /api/unsubscribe?t=<signed token>, and only that email of that account is switched off. The
 * signed token is the only proof (src/lib/alerts/unsubscribe-token.ts). Rate-limited per IP and
 * per account.
 *
 * GET never changes anything (mail scanners follow links): it opens the unsubscribe page, whose
 * button does it (src/app/[locale]/(site)/unsubscribe).
 */

export const dynamic = "force-dynamic";

function tokenOf(request: NextRequest): string | null {
  const t = request.nextUrl.searchParams.get("t");
  return t && t.length <= 200 ? t : null;
}

export async function POST(request: NextRequest) {
  const verified = verifyUnsubscribeToken(tokenOf(request));
  if (!verified) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  // Mail providers post from a few shared addresses: a generous limit per IP, a tight one per account.
  const [perIp, perAccount] = await Promise.all([
    rateLimitByIp("unsubscribe-oneclick", { limit: 600, windowSeconds: 3600 }),
    rateLimit(`unsubscribe-oneclick:user:${verified.userId}`, { limit: 10, windowSeconds: 3600 }),
  ]);
  if (!perIp.ok || !perAccount.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  try {
    await setUnsubscribeSwitch(verified.userId, verified.kind, false);
  } catch (error) {
    console.error("[unsubscribe] one-click failed:", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const token = tokenOf(request);
  const url = new URL(`/${siteConfig.i18n.primaryLocale}/unsubscribe`, request.nextUrl.origin);
  if (token) url.searchParams.set("t", token);
  return NextResponse.redirect(url, 303);
}
