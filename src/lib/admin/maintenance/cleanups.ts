import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseVerificationDocuments, type VerificationDocument } from "@/lib/admin/documents";
import { deletePrivate, isValidStorageKey, storageDriver } from "@/lib/storage";
import { localPath } from "@/lib/storage/local";
import { updateListingSearchText } from "@/lib/translate";
import { AdminActionError } from "../server/common";
import { latestBackup } from "./backup";
import {
  EXAMPLE_LIMIT,
  isBackupFresh,
  maskPhone,
  planContactMethods,
  planPhone,
  planTitle,
  planUserPhones,
  shorten,
  type CleanupName,
} from "./plan";

/**
 * The four data clean-ups the founder approved (answer 8, round 3), each with a dry run that
 * changes nothing and a run that is idempotent (a second run finds nothing left) and audited.
 * A run needs a complete backup from the last hour (./backup.ts). Rules: ./plan.ts.
 *
 *   phones              phone numbers to international format (+972 53…, +995 5…)
 *   title-emoji         emojis out of listing titles (and their translations), search text refreshed
 *   contact-taps        contact taps stop storing who tapped (ContactClick.userId → null)
 *   verification-files  stored ID, selfie and other verification files deleted; the decision rows
 *                       stay, marked "documents deleted"
 *
 * Used by Admin → Maintenance (./actions.ts) and `npm run cleanup` (scripts/cleanup.ts).
 */

export type CleanupLine = { key: string; count: number; warn?: boolean };
export type CleanupExample = { from: string; to: string | null };
export type CleanupReport = {
  name: CleanupName;
  mode: "dry_run" | "run";
  /** Rows or files the run changes (dry run) or changed (run). */
  changes: number;
  lines: CleanupLine[];
  /** A few masked examples. */
  examples: CleanupExample[];
  at: string;
  /** The backup the run relied on. */
  backupId?: string;
};

export type CleanupActor = { userId: string | null; via: "admin" | "cli" };

const running = new Set<CleanupName>();

function line(key: string, count: number, warn = false): CleanupLine {
  return warn ? { key, count, warn } : { key, count };
}

// ─── Phones ──────────────────────────────────────────────────────

async function collectPhones() {
  const [users, listings, bookings, places, lookups] = await Promise.all([
    db.user.findMany({ where: { phoneNumber: { not: null } }, select: { id: true, phoneNumber: true } }),
    db.listing.findMany({ select: { id: true, updatedAt: true, contactMethods: true } }),
    db.booking.findMany({ select: { id: true, guestPhone: true } }),
    db.jewishPlace.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true, countryCode: true } }),
    db.phoneLookup.findMany({ select: { phoneNumber: true } }),
  ]);
  const userPlan = planUserPhones(users.map((u) => ({ id: u.id, phoneNumber: u.phoneNumber ?? "" })));
  const listingPlans = listings
    .map((l) => ({ id: l.id, updatedAt: l.updatedAt, plan: planContactMethods(l.contactMethods, null) }))
    .filter((l) => l.plan.next || l.plan.noCountry.length || l.plan.invalid.length);
  const bookingPlans = bookings.map((b) => ({ id: b.id, plan: planPhone(b.guestPhone, null) }));
  // A community place is in its country: a number without a country code is local.
  const placePlans = places.map((p) => ({ id: p.id, plan: planPhone(p.phone, p.countryCode || "GE") }));
  // Lookups are cached per number; a key that is not in international form is never hit again.
  const staleLookups = lookups.filter((l) => planPhone(l.phoneNumber, null).status !== "ok").map((l) => l.phoneNumber);
  return { userPlan, listingPlans, bookingPlans, placePlans, staleLookups };
}

function phoneReport(data: Awaited<ReturnType<typeof collectPhones>>, mode: CleanupReport["mode"], applied?: { users: number; collisions: number; listings: number; bookings: number; places: number; lookups: number }): Omit<CleanupReport, "at"> {
  const { userPlan, listingPlans, bookingPlans, placePlans, staleLookups } = data;
  const listingsChanged = listingPlans.filter((l) => l.plan.next);
  const contactValues = listingsChanged.reduce((sum, l) => sum + l.plan.changed.length, 0);
  const count = (plans: { plan: { status: string } }[], status: string) => plans.filter((p) => p.plan.status === status).length;
  const counts = applied ?? {
    users: userPlan.updates.length,
    collisions: userPlan.collisions.length,
    listings: listingsChanged.length,
    bookings: count(bookingPlans, "changed"),
    places: count(placePlans, "changed"),
    lookups: staleLookups.length,
  };
  const examples: CleanupExample[] = [];
  const add = (from: string, to: string) => {
    if (examples.length < EXAMPLE_LIMIT) examples.push({ from: maskPhone(from), to: maskPhone(to) });
  };
  userPlan.updates.forEach((u) => add(u.from, u.to));
  listingsChanged.forEach((l) => l.plan.changed.forEach((c) => add(c.from, c.to)));
  bookingPlans.forEach((b) => b.plan.status === "changed" && add(b.plan.from, b.plan.to));
  placePlans.forEach((p) => p.plan.status === "changed" && add(p.plan.from, p.plan.to));
  return {
    name: "phones",
    mode,
    changes: counts.users + counts.listings + counts.bookings + counts.places + counts.lookups,
    lines: [
      line("phones.users", counts.users),
      line("phones.usersCollision", counts.collisions, counts.collisions > 0),
      line("phones.usersNoCountry", userPlan.noCountry.length, userPlan.noCountry.length > 0),
      line("phones.usersInvalid", userPlan.invalid.length, userPlan.invalid.length > 0),
      line("phones.listings", counts.listings),
      line("phones.contactValues", contactValues),
      line("phones.contactNoCountry", listingPlans.reduce((s, l) => s + l.plan.noCountry.length, 0), listingPlans.some((l) => l.plan.noCountry.length > 0)),
      line("phones.contactInvalid", listingPlans.reduce((s, l) => s + l.plan.invalid.length, 0), listingPlans.some((l) => l.plan.invalid.length > 0)),
      line("phones.bookings", counts.bookings),
      line("phones.bookingsNoCountry", count(bookingPlans, "no_country"), count(bookingPlans, "no_country") > 0),
      line("phones.bookingsInvalid", count(bookingPlans, "invalid"), count(bookingPlans, "invalid") > 0),
      line("phones.places", counts.places),
      line("phones.placesInvalid", count(placePlans, "invalid"), count(placePlans, "invalid") > 0),
      line("phones.lookups", counts.lookups),
    ],
    examples,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "P2002";
}

async function runPhones(): Promise<Omit<CleanupReport, "at">> {
  const data = await collectPhones();
  const applied = { users: 0, collisions: data.userPlan.collisions.length, listings: 0, bookings: 0, places: 0, lookups: 0 };
  for (const u of data.userPlan.updates) {
    try {
      // Only when the number is still the one planned (a sign-in may have changed it meanwhile).
      const { count } = await db.user.updateMany({ where: { id: u.id, phoneNumber: u.from }, data: { phoneNumber: u.to } });
      applied.users += count;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      applied.collisions += 1;
    }
  }
  for (const l of data.listingPlans) {
    if (!l.plan.next) continue;
    // Skipped when the host edited the listing since it was read; the next run picks it up.
    const { count } = await db.listing.updateMany({
      where: { id: l.id, updatedAt: l.updatedAt },
      data: { contactMethods: l.plan.next as Prisma.InputJsonValue },
    });
    applied.listings += count;
  }
  for (const b of data.bookingPlans) {
    if (b.plan.status !== "changed") continue;
    applied.bookings += (await db.booking.updateMany({ where: { id: b.id, guestPhone: b.plan.from }, data: { guestPhone: b.plan.to } })).count;
  }
  for (const p of data.placePlans) {
    if (p.plan.status !== "changed") continue;
    applied.places += (await db.jewishPlace.updateMany({ where: { id: p.id, phone: p.plan.from }, data: { phone: p.plan.to } })).count;
  }
  if (data.staleLookups.length) {
    applied.lookups = (await db.phoneLookup.deleteMany({ where: { phoneNumber: { in: data.staleLookups } } })).count;
  }
  return phoneReport(data, "run", applied);
}

// ─── Titles ──────────────────────────────────────────────────────

async function collectTitles() {
  const [listings, translations] = await Promise.all([
    db.listing.findMany({ select: { id: true, publicId: true, title: true } }),
    db.listingTranslation.findMany({ select: { id: true, listingId: true, title: true } }),
  ]);
  const listingPlans = listings.map((l) => ({ ...l, plan: planTitle(l.title) })).filter((l) => l.plan.status !== "ok");
  const translationPlans = translations.map((t) => ({ ...t, plan: planTitle(t.title) })).filter((t) => t.plan.status !== "ok");
  return { listingPlans, translationPlans };
}

function titleReport(data: Awaited<ReturnType<typeof collectTitles>>, mode: CleanupReport["mode"], applied?: { listings: number; translations: number }): Omit<CleanupReport, "at"> {
  const changedListings = data.listingPlans.filter((l) => l.plan.status === "changed");
  const changedTranslations = data.translationPlans.filter((t) => t.plan.status === "changed");
  const empty = [...data.listingPlans, ...data.translationPlans].filter((p) => p.plan.status === "empty").length;
  const counts = applied ?? { listings: changedListings.length, translations: changedTranslations.length };
  const examples = changedListings.slice(0, EXAMPLE_LIMIT).map((l) => ({
    from: `#${l.publicId} ${shorten(l.plan.status === "changed" ? l.plan.from : "")}`,
    to: shorten(l.plan.status === "changed" ? l.plan.to : ""),
  }));
  return {
    name: "title-emoji",
    mode,
    changes: counts.listings + counts.translations,
    lines: [line("titles.listings", counts.listings), line("titles.translations", counts.translations), line("titles.empty", empty, empty > 0)],
    examples,
  };
}

async function runTitles(): Promise<Omit<CleanupReport, "at">> {
  const data = await collectTitles();
  const applied = { listings: 0, translations: 0 };
  const touched = new Set<string>();
  for (const l of data.listingPlans) {
    if (l.plan.status !== "changed") continue;
    const { count } = await db.listing.updateMany({ where: { id: l.id, title: l.plan.from }, data: { title: l.plan.to } });
    applied.listings += count;
    if (count) touched.add(l.id);
  }
  for (const t of data.translationPlans) {
    if (t.plan.status !== "changed") continue;
    const { count } = await db.listingTranslation.updateMany({ where: { id: t.id, title: t.plan.from }, data: { title: t.plan.to } });
    applied.translations += count;
    if (count) touched.add(t.listingId);
  }
  // The search text holds every title; the address slug is built from the title when shown.
  for (const id of touched) {
    await updateListingSearchText(id).catch((error) => console.error("[cleanup] could not refresh the search text of", id, error));
  }
  return titleReport(data, "run", applied);
}

// ─── Contact taps ────────────────────────────────────────────────

async function contactTaps(mode: CleanupReport["mode"]): Promise<Omit<CleanupReport, "at">> {
  const count =
    mode === "run"
      ? (await db.contactClick.updateMany({ where: { userId: { not: null } }, data: { userId: null } })).count
      : await db.contactClick.count({ where: { userId: { not: null } } });
  return { name: "contact-taps", mode, changes: count, lines: [line("taps.withUser", count)], examples: [] };
}

// ─── Verification files ──────────────────────────────────────────

const KIND_LINE: Record<VerificationDocument["kind"], string> = {
  ID_FRONT: "files.idFront",
  ID_BACK: "files.idBack",
  SELFIE: "files.selfie",
  NAPR_EXTRACT: "files.ownership",
  BUSINESS_REGISTRATION: "files.business",
  OTHER: "files.other",
};

/** Files under private/verification/ on the local disk that no row knows about (local driver only). */
async function orphanLocalFiles(known: Set<string>): Promise<string[]> {
  if (storageDriver() !== "local") return [];
  const base = path.dirname(localPath("private", "private/verification/probe.jpg"));
  const found: string[] = [];
  async function walk(dir: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const key = `private/verification/${path.relative(base, full).split(path.sep).join("/")}`;
        if (isValidStorageKey(key) && !known.has(key)) found.push(key);
      }
    }
  }
  await walk(base);
  return found;
}

async function collectFiles() {
  const [requests, uploads] = await Promise.all([
    db.verificationRequest.findMany({ where: { documentsDeletedAt: null }, select: { id: true, userId: true, documents: true } }),
    db.privateUpload.findMany({ where: { purpose: "verification" }, select: { key: true, userId: true } }),
  ]);
  const requestDocs = requests.map((r) => ({ ...r, docs: parseVerificationDocuments(r.documents) }));
  const known = new Set<string>([...requestDocs.flatMap((r) => r.docs.map((d) => d.key)), ...uploads.map((u) => u.key)]);
  const attached = new Set(requestDocs.flatMap((r) => r.docs.map((d) => d.key)));
  const unattached = uploads.filter((u) => !attached.has(u.key));
  const orphans = await orphanLocalFiles(known);
  return { requestDocs, uploads, unattached, orphans };
}

function filesReport(data: Awaited<ReturnType<typeof collectFiles>>, mode: CleanupReport["mode"], failed = 0): Omit<CleanupReport, "at"> {
  const byKind = new Map<string, number>();
  for (const r of data.requestDocs) for (const d of r.docs) byKind.set(KIND_LINE[d.kind], (byKind.get(KIND_LINE[d.kind]) ?? 0) + 1);
  const accounts = new Set([...data.requestDocs.filter((r) => r.docs.length).map((r) => r.userId), ...data.uploads.map((u) => u.userId)]).size;
  const files = [...byKind.values()].reduce((s, n) => s + n, 0) + data.unattached.length + data.orphans.length;
  return {
    name: "verification-files",
    mode,
    changes: files + data.requestDocs.length + (data.uploads.length - data.unattached.length),
    lines: [
      ...Object.values(KIND_LINE).map((key) => line(key, byKind.get(key) ?? 0)),
      line("files.unattached", data.unattached.length),
      line("files.orphans", data.orphans.length),
      line("files.requests", data.requestDocs.length),
      line("files.accounts", accounts),
      ...(mode === "run" ? [line("files.failed", failed, failed > 0)] : []),
    ],
    examples: [],
  };
}

async function deleteKeys(keys: string[]): Promise<Set<string>> {
  const failed = new Set<string>();
  for (let i = 0; i < keys.length; i += 20) {
    const chunk = keys.slice(i, i + 20);
    const results = await Promise.allSettled(chunk.map((key) => deletePrivate(key)));
    results.forEach((r, j) => {
      if (r.status === "rejected") {
        failed.add(chunk[j]);
        console.error("[cleanup] could not delete a verification file:", r.reason);
      }
    });
  }
  return failed;
}

async function runFiles(): Promise<Omit<CleanupReport, "at">> {
  const data = await collectFiles();
  const keys = [...new Set([...data.requestDocs.flatMap((r) => r.docs.map((d) => d.key)), ...data.uploads.map((u) => u.key), ...data.orphans])];
  const failed = await deleteKeys(keys.filter(isValidStorageKey));
  const now = new Date();
  for (const r of data.requestDocs) {
    const left = r.docs.filter((d) => failed.has(d.key));
    // The decision row stays (status, reviewer, date); only the files and their keys go.
    await db.verificationRequest.updateMany({
      where: { id: r.id, documentsDeletedAt: null },
      data: { documents: left.map((d) => ({ ...d })) as Prisma.InputJsonValue, documentsDeletedAt: left.length === 0 ? now : null },
    });
  }
  const deletedUploads = data.uploads.filter((u) => !failed.has(u.key)).map((u) => u.key);
  if (deletedUploads.length) await db.privateUpload.deleteMany({ where: { key: { in: deletedUploads }, purpose: "verification" } });
  return filesReport(data, "run", failed.size);
}

// ─── Entry points ────────────────────────────────────────────────

/** What a run would change. Reads only. */
export async function dryRunCleanup(name: CleanupName): Promise<CleanupReport> {
  const at = new Date().toISOString();
  switch (name) {
    case "phones":
      return { ...phoneReport(await collectPhones(), "dry_run"), at };
    case "title-emoji":
      return { ...titleReport(await collectTitles(), "dry_run"), at };
    case "contact-taps":
      return { ...(await contactTaps("dry_run")), at };
    case "verification-files":
      return { ...filesReport(await collectFiles(), "dry_run"), at };
  }
}

/** Throws "backup_required" unless a complete backup from the last hour exists. Returns its id. */
export async function assertFreshBackup(now: Date = new Date()): Promise<string> {
  const latest = await latestBackup();
  if (!latest || !isBackupFresh(latest.createdAt, now)) throw new AdminActionError("backup_required", 409);
  return latest.id;
}

/** Runs one clean-up (after the backup check) and writes it to the audit log. */
export async function runCleanup(name: CleanupName, actor: CleanupActor): Promise<CleanupReport> {
  const backupId = await assertFreshBackup();
  if (running.has(name)) throw new AdminActionError("cleanup_running", 409);
  running.add(name);
  try {
    const report =
      name === "phones" ? await runPhones() : name === "title-emoji" ? await runTitles() : name === "contact-taps" ? await contactTaps("run") : await runFiles();
    const full: CleanupReport = { ...report, at: new Date().toISOString(), backupId };
    await audit({
      actorId: actor.userId,
      action: "maintenance.cleanup",
      targetType: "Cleanup",
      targetId: name,
      details: { via: actor.via, backupId, changes: full.changes, lines: Object.fromEntries(full.lines.map((l) => [l.key, l.count])) },
    });
    return full;
  } finally {
    running.delete(name);
  }
}

export type MaintenanceHistory = {
  backups: { at: string; by: string | null }[];
  runs: Partial<Record<CleanupName, { at: string; by: string | null; changes: number }>>;
};

/** The latest runs (from the audit log), for the page. */
export async function maintenanceHistory(): Promise<MaintenanceHistory> {
  const rows = await db.auditLog.findMany({
    where: { action: { in: ["maintenance.cleanup", "maintenance.backup"] } },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { action: true, targetId: true, createdAt: true, details: true, actor: { select: { name: true } } },
  });
  const history: MaintenanceHistory = { backups: [], runs: {} };
  for (const row of rows) {
    const by = row.actor?.name ?? null;
    if (row.action === "maintenance.backup") {
      if (history.backups.length < 5) history.backups.push({ at: row.createdAt.toISOString(), by });
      continue;
    }
    const name = row.targetId as CleanupName | null;
    if (!name || history.runs[name]) continue;
    const changes = Number((row.details as { changes?: unknown } | null)?.changes ?? 0);
    history.runs[name] = { at: row.createdAt.toISOString(), by, changes: Number.isFinite(changes) ? changes : 0 };
  }
  return history;
}
