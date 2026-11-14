import { healthStatus } from "@/lib/maintenance/health";

/**
 * GET /api/health — for the uptime monitor (SECURITY_REPORT 16.4) and the maintenance-mode check
 * (it stays reachable while maintenance mode is on, src/lib/maintenance/mode.ts). Answers
 * { ok, database, maintenance }: 200 when the database answers, 503 when it does not. Nothing
 * else: no version, no host names, no counts. The database is pinged at most once every 10
 * seconds per server, whatever the number of calls (src/lib/maintenance/health.ts).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { database, maintenance } = await healthStatus();
  return Response.json(
    { ok: database, database: database ? "ok" : "down", maintenance },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
