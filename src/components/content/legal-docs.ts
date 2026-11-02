import { Accessibility, Cookie, FileText, ListChecks, ShieldCheck, type LucideIcon } from "lucide-react";

export const legalDocKeys = ["terms", "privacy", "cookies", "listingRules", "accessibility"] as const;
export type LegalDocKey = (typeof legalDocKeys)[number];

export const legalDocs: Record<LegalDocKey, { path: string; icon: LucideIcon; lastUpdated: string }> = {
  terms: { path: "/legal/terms", icon: FileText, lastUpdated: "2026-11-02" },
  privacy: { path: "/legal/privacy", icon: ShieldCheck, lastUpdated: "2026-10-31" },
  cookies: { path: "/legal/cookies", icon: Cookie, lastUpdated: "2026-10-31" },
  listingRules: { path: "/legal/listing-rules", icon: ListChecks, lastUpdated: "2026-10-31" },
  accessibility: { path: "/legal/accessibility", icon: Accessibility, lastUpdated: "2026-10-31" },
};

/**
 * The cookies the site sets (names are code, not text). Purpose and duration are translated in
 * legal.cookies.sections.list.table.rows.<id>. Keep this list in sync with the real cookies.
 */
export const siteCookies = [
  { id: "locale", name: "NEXT_LOCALE", category: "preferences" },
  { id: "currency", name: "bayit_currency", category: "preferences" },
  { id: "consent", name: "bayit_consent", category: "necessary" },
  { id: "device", name: "bayit_did", category: "necessary" },
  { id: "session", name: "better-auth.*", category: "necessary" },
] as const;

export function sectionAnchor(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
