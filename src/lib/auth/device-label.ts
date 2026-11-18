/**
 * A short, coarse name for a browser ("Chrome · Android") for the new-device emails
 * (SECURITY_REPORT 3.6.e). Pure. Only the browser family and the system: never versions, never
 * the IP or a place, so the email says nothing an attacker could use.
 */

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

/** "Chrome · Android", "Safari · iPhone"; null when nothing is recognised. */
export function describeDevice(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? "").slice(0, 512);
  if (!ua) return null;
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  if (!browser && !system) return null;
  return [browser, system].filter(Boolean).join(" · ");
}
