import type { NextRequest } from "next/server";
import { dealRedirect } from "@/lib/search/deal-redirect";

/** /buy → /search?deal=buy (308, permanent; other parameters are kept). */
export function GET(request: NextRequest, ctx: { params: Promise<{ locale: string }> }) {
  return dealRedirect("buy", request, ctx);
}
