import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isAppLocale } from "@/i18n/locale";
import type { DealFilter } from "@/lib/listing/search-params";
import { dealRedirectQuery } from "@/lib/search/deal-query";

/**
 * /rent, /buy and /hotels → /search?deal=… with a real 308 (route handlers, so the redirect is
 * not streamed after the page shell), keeping the other parameters.
 */
export async function dealRedirect(
  deal: DealFilter,
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale } = await params;
  const raw: Record<string, string[]> = {};
  for (const [key, value] of request.nextUrl.searchParams) (raw[key] ??= []).push(value);
  const target = new URL(`/${isAppLocale(locale) ? locale : "en"}/search?${dealRedirectQuery(deal, raw)}`, request.nextUrl);
  return NextResponse.redirect(target, 308);
}
