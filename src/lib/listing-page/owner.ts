import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { OWNER_PUBLIC_SELECT, toOwnerSummary } from "./load";
import type { OwnerSummary } from "./types";

/**
 * The public owner profile (/owner/[id]), server-only. Never selects phone or email.
 * Deleted and banned accounts — and demo accounts while demo data is hidden — are not found.
 */
export type OwnerProfile = OwnerSummary & { bio: string | null };

async function load(id: string): Promise<OwnerProfile | null> {
  if (!id || id.length > 64) return null;
  const [row, settings] = await Promise.all([
    db.user.findUnique({ where: { id }, select: { ...OWNER_PUBLIC_SELECT, bio: true } }),
    getSettings(),
  ]);
  if (!row || row.deletedAt || row.status === "BANNED" || row.status === "DELETED") return null;
  if (row.isDemo && !settings.demoDataVisible) return null;
  return { ...toOwnerSummary(row), bio: row.bio?.trim() || null };
}

export const getOwnerProfile = cache(load);
