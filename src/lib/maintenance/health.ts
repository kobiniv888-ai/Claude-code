import "server-only";
import { db } from "@/lib/db";
import { maintenanceState } from "./state";

/**
 * What /api/health answers (SECURITY_REPORT 16.4; the uptime monitor and the maintenance-mode
 * check): is the database answering, and is maintenance mode on. Nothing else (no version, host
 * names or counts). The database is pinged at most once every HEALTH_PING_CACHE_MS per server,
 * whatever the number of calls, and a ping that takes longer than 3 seconds counts as down.
 */

export const HEALTH_PING_CACHE_MS = 10_000;
const PING_TIMEOUT_MS = 3000;

let last: { ok: boolean; at: number } | null = null;
let pinging: Promise<boolean> | null = null;

export async function databaseOk(): Promise<boolean> {
  if (last && Date.now() - last.at < HEALTH_PING_CACHE_MS) return last.ok;
  if (!pinging) {
    pinging = Promise.race([
      db.$queryRaw`SELECT 1`.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PING_TIMEOUT_MS).unref?.()),
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

export async function healthStatus(): Promise<{ database: boolean; maintenance: boolean }> {
  const [database, maintenance] = await Promise.all([databaseOk(), maintenanceState().then((s) => s.on).catch(() => false)]);
  return { database, maintenance };
}
