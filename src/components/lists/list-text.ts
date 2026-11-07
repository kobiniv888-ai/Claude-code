/**
 * Small text helpers shared by the list components (client-safe, pure).
 */

/** The error codes with a text of their own in `lists.errors`. */
export const LIST_ERROR_CODES = [
  "name_required",
  "name_too_long",
  "name_taken",
  "name_has_contact",
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
