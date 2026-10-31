/**
 * Links within /jewish-life that keep the visitor's other choices (pure, client-safe).
 *
 *   jewishLifeHref({ type: "synagogue", month: "2026-11" }, { city: "batumi" }, "calendar")
 *     → "/jewish-life?type=synagogue&month=2026-11&city=batumi#calendar"
 */

export const JEWISH_LIFE_PATH = "/jewish-life";

/** Query parameters the page understands (anything else is dropped from generated links). */
export const JEWISH_LIFE_PARAMS = ["type", "placeCity", "city", "month"] as const;
export type JewishLifeParam = (typeof JEWISH_LIFE_PARAMS)[number];

export type JewishLifeParams = Partial<Record<JewishLifeParam, string>>;

/** Picks the known parameters from a page's searchParams (first value of repeated ones). */
export function pickJewishLifeParams(searchParams: Record<string, string | string[] | undefined>): JewishLifeParams {
  const out: JewishLifeParams = {};
  for (const key of JEWISH_LIFE_PARAMS) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) out[key] = value;
  }
  return out;
}

export function jewishLifeHref(
  current: JewishLifeParams,
  changes: Partial<Record<JewishLifeParam, string | null>> = {},
  hash?: string,
): string {
  const params = new URLSearchParams();
  for (const key of JEWISH_LIFE_PARAMS) {
    const value = key in changes ? changes[key] : current[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `${JEWISH_LIFE_PATH}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}
