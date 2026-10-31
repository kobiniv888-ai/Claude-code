/**
 * Reading admin list filters from the URL (pure, client-safe). Every list page keeps its
 * filters in the query string so links can be shared between staff and survive a refresh.
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, trimmed ("" when missing). */
export function param(params: SearchParamsRecord, name: string): string {
  const value = params[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

/** A value from a fixed list, or `fallback`. */
export function enumParam<T extends string>(
  params: SearchParamsRecord,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T;
export function enumParam<T extends string>(
  params: SearchParamsRecord,
  name: string,
  allowed: readonly T[],
  fallback?: undefined,
): T | undefined;
export function enumParam<T extends string>(
  params: SearchParamsRecord,
  name: string,
  allowed: readonly T[],
  fallback?: T,
): T | undefined {
  const value = param(params, name);
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Page number ≥ 1 (bad values → 1). */
export function pageParam(params: SearchParamsRecord, name = "page"): number {
  const n = Number(param(params, name));
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

/** "2026-10-31" → Date at the start of that day in UTC (null when missing or invalid). */
export function dateParam(params: SearchParamsRecord, name: string): Date | null {
  const value = param(params, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The day after `date` (for inclusive "to" dates). */
export function nextDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 3600 * 1000);
}

export type PageInfo = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  skip: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/** Clamps the page into range and computes skip/take for the query. */
export function pageInfo(total: number, requestedPage: number, pageSize: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  return {
    page,
    pageSize,
    pageCount,
    total,
    skip: (page - 1) * pageSize,
    hasPrev: page > 1,
    hasNext: page < pageCount,
  };
}

/**
 * The current query with some values changed: `null`/"" removes a key. Changing anything but
 * the page resets the page. Returns "?a=1&b=2" or "" (for Link hrefs: `${path}${query}`).
 */
export function withParams(
  current: SearchParamsRecord | URLSearchParams,
  patch: Record<string, string | number | null | undefined>,
): string {
  const next = new URLSearchParams();
  const entries: [string, string][] =
    current instanceof URLSearchParams
      ? [...current.entries()]
      : Object.entries(current).flatMap(([k, v]) =>
          (Array.isArray(v) ? v.slice(0, 1) : [v]).filter((x): x is string => typeof x === "string").map((x) => [k, x] as [string, string]),
        );
  for (const [key, value] of entries) if (value !== "") next.set(key, value);
  const resetsPage = Object.keys(patch).some((key) => key !== "page");
  if (resetsPage) next.delete("page");
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  if (next.get("page") === "1") next.delete("page");
  const query = next.toString();
  return query ? `?${query}` : "";
}

/** Page numbers to show around the current one: [1, "gap", 4, 5, 6, "gap", 12]. */
export function pageWindow(page: number, pageCount: number, radius = 1): (number | "gap")[] {
  if (pageCount <= 1) return [1];
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= pageCount) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : "gap");
    out.push(p);
  });
  return out;
}
