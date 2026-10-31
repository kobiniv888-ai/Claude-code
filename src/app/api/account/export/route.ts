import { siteConfig } from "@/config/site";
import { buildAccountExport } from "@/lib/account/export";
import { requireUserForAction } from "@/lib/auth/session";
import { AuthRequiredError, RateLimitError } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/listing/urls";

/**
 * GET /api/account/export — "Download my data": a JSON file with everything about the signed-in
 * user (see buildAccountExport). At most 3 downloads a day.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const user = await requireUserForAction();
    await assertRateLimit(`account:export:${user.id}`, { limit: 3, windowSeconds: 86_400 });
    const data = await buildAccountExport(user.id);
    const day = data.exportedAt.slice(0, 10);
    const name = `${slugify(siteConfig.name) || "account"}-my-data-${day}.json`;
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) return Response.json({ error: "auth_required" }, { status: 401, headers });
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "rate_limited" },
        { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    console.error("[account] export failed:", error);
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}
