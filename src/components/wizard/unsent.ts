"use client";

import { parseUnsent, type UnsentChanges } from "@/lib/wizard/patch";

/*
 * Unsent answers of the post form, per listing, in sessionStorage (bug 2.2): a reload, the phone
 * closing the page or Back from another page can no longer lose an answer typed in the last
 * moment before the auto-save. Storage can be missing or full (private mode): every call is
 * wrapped, and the form works the same without it.
 */

const key = (listingId: string) => `bayit:post-form:${listingId}:unsent`;
const scrollKey = (listingId: string) => `bayit:post-form:${listingId}:scroll`;

export function readUnsent(listingId: string): UnsentChanges | null {
  try {
    return parseUnsent(window.sessionStorage.getItem(key(listingId)));
  } catch {
    return null;
  }
}

export function writeUnsent(listingId: string, entry: UnsentChanges | null): void {
  try {
    if (!entry || Object.keys(entry.fields).length === 0) window.sessionStorage.removeItem(key(listingId));
    else window.sessionStorage.setItem(key(listingId), JSON.stringify(entry));
  } catch {
    // Storage unavailable or full: the auto-save still runs.
  }
}

type ScrollEntry = { step: string; y: number; at: number };

/** Where the page was scrolled on a step, to come back to it from a page reached from the form. */
export function writeScroll(listingId: string, step: string, y: number): void {
  try {
    window.sessionStorage.setItem(scrollKey(listingId), JSON.stringify({ step, y: Math.max(0, Math.round(y)), at: Date.now() } satisfies ScrollEntry));
  } catch {
    // Not important enough to fail on.
  }
}

/** The saved scroll position of `step` (at most 30 minutes old), once; null when none. */
export function takeScroll(listingId: string, step: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(scrollKey(listingId));
    window.sessionStorage.removeItem(scrollKey(listingId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<ScrollEntry>;
    if (entry.step !== step || typeof entry.y !== "number" || typeof entry.at !== "number") return null;
    return Date.now() - entry.at < 30 * 60 * 1000 ? entry.y : null;
  } catch {
    return null;
  }
}
