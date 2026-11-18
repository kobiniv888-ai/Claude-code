/**
 * Pure: no imports, so the email layout and the templates can both use it (no import cycle).
 */

/**
 * User-written text (quotes) can hold a web or email address that mail apps would turn into a
 * link. Its dots and "@" become look-alike characters (one dot leader, full-width at) so the text
 * stays readable but is never a link (SECURITY_REPORT 13.4.b).
 */
const ADDRESS_LIKE = /(?:[a-z][a-z0-9+.-]*:\/\/)?[\p{L}\p{N}_%+-]+(?:[.@][\p{L}\p{N}_%+-]+)+(?:\/[^\s]*)?/giu;
export function defuseLinks(text: string): string {
  return text.replace(ADDRESS_LIKE, (match) =>
    /[.@]\p{L}{2,}/u.test(match) ? match.replace(/:\/\//g, ":\u2215\u2215").replace(/\./g, "\u2024").replace(/@/g, "\uff20") : match,
  );
}
