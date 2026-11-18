import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  MAINTENANCE_CACHE_MS,
  MAINTENANCE_OFF,
  MAINTENANCE_SETTING_KEY,
  envForcesMaintenance,
  parseStoredMaintenance,
  readMaintenanceEnv,
  type StoredMaintenance,
} from "./mode";

/**
 * The maintenance switch as this server sees it (rules: ./mode.ts). The stored admin switch is read
 * at most once every MAINTENANCE_CACHE_MS per server; while a fresh read is under way the last
 * value keeps answering (no request waits, except the very first one of a new server).
 */

export type MaintenanceState = {
  on: boolean;
  /** "env": MAINTENANCE_MODE (the admin switch cannot turn it off); "admin": the stored switch. */
  source: "env" | "admin" | null;
  stored: StoredMaintenance;
};

type Cache = { value: StoredMaintenance; at: number } | null;
let cache: Cache = null;
let refreshing: Promise<StoredMaintenance> | null = null;
let warned = false;

async function readStored(): Promise<StoredMaintenance> {
  const row = await db.siteSetting.findUnique({ where: { key: MAINTENANCE_SETTING_KEY }, select: { value: true } });
  return parseStoredMaintenance(row?.value);
}

function refresh(): Promise<StoredMaintenance> {
  if (!refreshing) {
    refreshing = readStored()
      .then((value) => {
        cache = { value, at: Date.now() };
        warned = false;
        return value;
      })
      .catch((error) => {
        // Keep the last value known; none known: off (the next request tries again).
        if (!warned) {
          warned = true;
          console.error("[maintenance] could not read the switch:", (error as Error)?.message ?? error);
        }
        return cache?.value ?? MAINTENANCE_OFF;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/** The stored admin switch, cached (see above). */
export async function storedMaintenance(): Promise<StoredMaintenance> {
  if (!cache) return refresh();
  if (Date.now() - cache.at > MAINTENANCE_CACHE_MS) void refresh();
  return cache.value;
}

export async function maintenanceState(env: NodeJS.ProcessEnv = process.env): Promise<MaintenanceState> {
  const fromEnv = readMaintenanceEnv(env.MAINTENANCE_MODE);
  if (envForcesMaintenance(fromEnv)) return { on: true, source: "env", stored: cache?.value ?? MAINTENANCE_OFF };
  const stored = await storedMaintenance();
  return { on: stored.on, source: stored.on ? "admin" : null, stored };
}

/** Saves the admin switch inside the caller's transaction and updates this server's copy at once. */
export async function saveMaintenance(tx: Prisma.TransactionClient, value: StoredMaintenance, staffId: string): Promise<void> {
  await tx.siteSetting.upsert({
    where: { key: MAINTENANCE_SETTING_KEY },
    create: { key: MAINTENANCE_SETTING_KEY, value: value as unknown as Prisma.InputJsonValue, updatedById: staffId },
    update: { value: value as unknown as Prisma.InputJsonValue, updatedById: staffId },
  });
}

/** After the transaction committed: this server answers with the new value right away. */
export function rememberMaintenance(value: StoredMaintenance): void {
  cache = { value, at: Date.now() };
}

/** Tests: forget the cached value. */
export function resetMaintenanceCache(): void {
  cache = null;
  refreshing = null;
}
