import type { NextRequest } from "next/server";
import { dealRedirect } from "@/lib/search/deal-redirect";

/** /hotels → /search?deal=hotels (308, permanent; other parameters are kept). */
export function GET(request: NextRequest, ctx: { params: Promise<{ locale: string }> }) {
  return dealRedirect("hotels", request, ctx);
}
