import { NextResponse, type NextRequest } from "next/server";
import { codeDisplayForHeaders } from "@/lib/auth/code-display";
import { checkLoginEmail } from "@/lib/auth/email-code";
import { emailCodeKey, phoneCodeKey, readScreenCode } from "@/lib/auth/sms";

/**
 * The last login code shown on screen for ?phone= (E.164) or ?email=, for the
 * "Test mode — your code is …" hint in the login forms and for the e2e tests.
 * Only where codes may be shown (src/lib/auth/code-display.ts): in development, or with
 * AUTH_TEST_MODE=true on localhost / a Codespaces preview. 404 everywhere else (the real site).
 * Codes sent by a real SMS or email service are never kept, so this returns null for them.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export function GET(request: NextRequest) {
  const display = codeDisplayForHeaders(request.headers);
  if (!display) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const params = request.nextUrl.searchParams;
  const phone = params.get("phone");
  const email = params.get("email");
  if (phone !== null) {
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json({ code: readScreenCode(phoneCodeKey(phone), display) }, { headers: NO_STORE });
  }
  const address = checkLoginEmail(email);
  if (!address) return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ code: readScreenCode(emailCodeKey(address), display) }, { headers: NO_STORE });
}
