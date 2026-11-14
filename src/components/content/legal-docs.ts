import { Accessibility, Cookie, FileText, ListChecks, ShieldCheck, type LucideIcon } from "lucide-react";
import { TERMS_VERSION } from "@/lib/legal/terms";

export const legalDocKeys = ["terms", "privacy", "cookies", "listingRules", "accessibility"] as const;
export type LegalDocKey = (typeof legalDocKeys)[number];

export const legalDocs: Record<LegalDocKey, { path: string; icon: LucideIcon; lastUpdated: string }> = {
  // The Terms' date is their version (TERMS_VERSION): changing the Terms means a new version.
  terms: { path: "/legal/terms", icon: FileText, lastUpdated: TERMS_VERSION },
  privacy: { path: "/legal/privacy", icon: ShieldCheck, lastUpdated: "2026-11-14" },
  cookies: { path: "/legal/cookies", icon: Cookie, lastUpdated: "2026-11-14" },
  listingRules: { path: "/legal/listing-rules", icon: ListChecks, lastUpdated: "2026-10-31" },
  accessibility: { path: "/legal/accessibility", icon: Accessibility, lastUpdated: "2026-11-14" },
};

/**
 * The cookies the site sets: all essential (SECURITY_REPORT 15.10.a; the list and why in
 * src/lib/legal/cookies.ts). Purpose and duration are translated in
 * legal.cookies.sections.list.table.rows.<id>.
 */
export { siteCookies } from "@/lib/legal/cookies";

export function sectionAnchor(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
