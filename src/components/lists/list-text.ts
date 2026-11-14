/**
 * Small text helpers shared by the list components (client-safe, pure).
 */
import { isolate } from "@/lib/format";

/** The error codes with a text of their own in `lists.errors`. */
export const LIST_ERROR_CODES = [
  "name_required",
  "name_too_long",
  "name_taken",
  "name_has_contact",
  "name_has_payment",
  "too_many_lists",
  "too_many_saved",
  "default_list",
  "own_list",
  "device_full",
  "storage_blocked",
] as const;

export type ListErrorCode = (typeof LIST_ERROR_CODES)[number];

export function isListErrorCode(code: string | null | undefined): code is ListErrorCode {
  return (LIST_ERROR_CODES as readonly string[]).includes(code ?? "");
}

/** The default list is always shown with its localized name ("שמורים"); the others as written. */
export function displayListName(list: { name: string; isDefault: boolean }, defaultName: string): string {
  return list.isDefault ? defaultName : list.name;
}

/**
 * A list's name as a value inside a translated sentence ("נשמר ברשימה „{name}”"): isolated
 * (FSI … PDI), so a user-written name like "2027 Gudauri" keeps its own order in a Hebrew or
 * Arabic sentence (bidi-1). Every `{ name }` a list component passes to a message goes through it.
 */
export function listNameArg(name: string): string {
  return isolate(name);
}

/** The selected list's heading on the saved pages (focus lands there when the last card goes). */
export const SAVED_LIST_HEADING_ID = "saved-list-heading";

/**
 * After a card left the list (moved to another list or removed), where keyboard focus goes: the
 * next card's id, else the previous one's, else null (the list's heading; a11y-2).
 */
export function nextFocusAfterRemoval(order: readonly string[], removedId: string): string | null {
  const at = order.indexOf(removedId);
  if (at < 0) return order[0] ?? null;
  return order[at + 1] ?? order[at - 1] ?? null;
}
