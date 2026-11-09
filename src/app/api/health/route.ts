import { db } from "@/lib/db";
import { maintenanceState } from "@/lib/maintenance/state";

/**
 * GET /api/health — for the uptime monitor (SECURITY_REPORT 16.4) and the maintenance-mode check
 * (it stays reachable while maintenance mode is on, src/lib/maintenance/mode.ts). Answers
 * { ok, database, maintenance }: 200 when the database answers, 503 when it does not. Nothing
 * else: no version, no host names, no counts. The database is pinged at most once every
 * PING_CACHE_MS per server, whatever the number of calls.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PING_CACHE_MS = 10_000;
let last: { ok: boolean; at: number } | null = null;
let pinging: Promise<boolean> | null = null;

async function databaseOk(): Promise<boolean> {
  if (last && Date.now() - last.at < PING_CACHE_MS) return last.ok;
  if (!pinging) {
    pinging = Promise.race([
      db.$queryRaw`SELECT 1`.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000).unref?.()),
    ])
      .catch(() => false)
      .then((ok) => {
        last = { ok, at: Date.now() };
        pinging = null;
        return ok;
      });
  }
  return pinging;
}

export async function GET() {
  const [database, maintenance] = await Promise.all([databaseOk(), maintenanceState().then((s) => s.on).catch(() => false)]);
  return Response.json(
    { ok: database, database: database ? "ok" : "down", maintenance },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
