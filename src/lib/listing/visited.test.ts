/**
 * The internal note of "ביקרנו במקום" (Listing.visitedNote) and who entered it (visitedById) are
 * staff-only: no code outside the admin panel may read them, and the public card select reads
 * the date alone (brief 8.3; the founder's rule that staff notes never reach the public site).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listingCardSelect, toListingCard, type ListingCardRow } from "@/lib/listing/mappers";

const SRC = path.resolve(__dirname, "../..");
/**
 * Reading or writing the staff-only columns (comments that merely name them don't count, and
 * neither does an explicit `visitedNote: false` in a column allowlist such as the data export).
 */
const USES_STAFF_COLUMN = /\bvisited(?:Note|ById)\s*(?::(?!\s*false\b)|\?)|\.visited(?:Note|ById)\b/;

/** The argument text of every `<client>.listing.find…(…)` call in `source`. */
function listingReads(source: string): string[] {
  const reads: string[] = [];
  for (const match of source.matchAll(/\b\w+\.listing\.find\w*\(/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < source.length && depth > 0) {
      const ch = source[end++];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    reads.push(source.slice(start, end - 1));
  }
  return reads;
}

/** Does a read's options object list columns to leave out (`omit`) at its top level? */
function hasTopLevelOmit(args: string): boolean {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (depth === 1 && /^omit\s*:/.test(args.slice(i, i + 10)) && !/[\w$]/.test(args[i - 1] ?? "")) return true;
  }
  return false;
}

const ALLOWED = [
  path.join("lib", "admin") + path.sep,
  path.join("app", "[locale]", "admin") + path.sep,
  "generated" + path.sep,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the visit note stays in the admin panel", () => {
  it("only admin code reads Listing.visitedNote or visitedById", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => path.relative(SRC, file))
      .filter((rel) => !ALLOWED.some((prefix) => rel.startsWith(prefix)))
      .filter((rel) => USES_STAFF_COLUMN.test(readFileSync(path.join(SRC, rel), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the guard itself notices a public read", () => {
    expect(USES_STAFF_COLUMN.test("select: { visitedNote: true }")).toBe(true);
    expect(USES_STAFF_COLUMN.test("row.visitedById")).toBe(true);
    expect(USES_STAFF_COLUMN.test("{ visitedNote?: string }")).toBe(true);
    expect(USES_STAFF_COLUMN.test("// never visitedNote / visitedById")).toBe(false);
    expect(USES_STAFF_COLUMN.test("visitedNote: false, // STAFF ONLY")).toBe(false);
  });

  // A denylist read (`omit`) returns every column it doesn't name, so each new staff-only column
  // (like these two) would reach the reader without the code ever naming it. Outside the admin
  // panel, Listing is read with `select` (or mapped field by field), never with `omit`.
  it("no Listing read outside the admin panel uses an omit denylist", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => path.relative(SRC, file))
      .filter((rel) => !ALLOWED.some((prefix) => rel.startsWith(prefix)))
      .filter((rel) => listingReads(readFileSync(path.join(SRC, rel), "utf8")).some(hasTopLevelOmit));
    expect(offenders).toEqual([]);
  });

  it("the omit guard itself notices a denylist read", () => {
    const [read] = listingReads("await db.listing.findMany({ where: { ownerId }, omit: { icalToken: true } });");
    expect(hasTopLevelOmit(read)).toBe(true);
    const [nested] = listingReads("tx.listing.findFirst({ select: { id: true, roomTypes: { omit: { listingId: true } } } })");
    expect(hasTopLevelOmit(nested)).toBe(false);
  });

  it("the card select reads the visit date, not the note", () => {
    const select = listingCardSelect("he") as Record<string, unknown>;
    expect(select).toHaveProperty("visitedAt", true);
    expect(select).not.toHaveProperty("visitedNote");
    expect(select).not.toHaveProperty("visitedById");
  });

  it("a card carries a yes/no badge only, never the date", () => {
    const row = {
      id: "lst_1",
      publicId: 1234,
      title: "Test flat",
      originalLocale: "en",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      bedrooms: 1,
      bathrooms: 1,
      sizeSqm: 40,
      maxGuests: 2,
      price: 100,
      currency: "GEL",
      pricePeriod: "NIGHT",
      priceUsd: 37,
      isShabbatFriendly: false,
      kitchenKosher: null,
      synagogueWalkMin: null,
      jewishFeatures: [],
      hotelJewishFeatures: [],
      publishedAt: new Date("2026-10-01T00:00:00Z"),
      priceDroppedAt: null,
      featuredUntil: null,
      isDemo: false,
      ownerVerifiedAt: null,
      visitedAt: new Date("2026-11-03T00:00:00.000Z"),
      approxLat: 41.7,
      approxLng: 44.8,
      owner: { accountType: "PRIVATE", idVerifiedAt: null, welcomePledgeVersion: 1, keepsShabbat: false, spokenLanguages: [] },
      city: null,
      neighborhood: null,
      translations: [],
      photos: [],
      _count: { photos: 0 },
      floor: null,
      rooms: null,
      bedsSingle: null,
      bedsDouble: null,
      bedsSofa: null,
      roomTypes: [],
    } as unknown as ListingCardRow;
    const now = new Date("2026-11-04T12:00:00Z");
    const card = toListingCard(row, { locale: "he", now });
    expect(card.badges.visited).toBe(true);
    expect(JSON.stringify(card)).not.toContain("2026-11-03");
    expect(toListingCard({ ...row, isDemo: true }, { locale: "he", now }).badges.visited).toBe(false);
    expect(toListingCard({ ...row, visitedAt: null }, { locale: "he", now }).badges.visited).toBe(false);
  });
});
