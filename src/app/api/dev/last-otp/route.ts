import { NextResponse, type NextRequest } from "next/server";
import { isDevOtpMode, readDevOtp } from "@/lib/auth/sms";

/**
 * Development only: the last login code sent to ?phone= (E.164), for the
 * "Development mode — your code is …" hint on the login form.
 * 404 in production and whenever Twilio is configured.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export function GET(request: NextRequest) {
  if (!isDevOtpMode()) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const phone = request.nextUrl.searchParams.get("phone") ?? "";
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json({ code: readDevOtp(phone) }, { headers: NO_STORE });
}
