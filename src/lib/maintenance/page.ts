/**
 * The calm 503 page of maintenance mode (SECURITY_REPORT 12.5.c): plain HTML built in the proxy, so
 * it needs no database, no React and no other file. Text from messages/<locale>/maintenance.json
 * ("page"), the brand colors of src/config/site.ts, a Lucide icon drawn inline, its own strict CSP
 * (styles by nonce only, no scripts). Pure: tested in ./mode.test.ts.
 */
import ar from "../../../messages/ar/maintenance.json";
import en from "../../../messages/en/maintenance.json";
import he from "../../../messages/he/maintenance.json";
import ka from "../../../messages/ka/maintenance.json";
import ru from "../../../messages/ru/maintenance.json";
import { siteConfig, type AppLocale } from "@/config/site";
import { MAINTENANCE_RETRY_AFTER_SECONDS } from "./mode";

const MESSAGES: Record<AppLocale, typeof en> = { he, en, ru, ar, ka };
const RTL = new Set<AppLocale>(["he", "ar"]);

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

/** Lucide "wrench" (lucide-react 1.65), drawn inline. */
const WRENCH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>';

export function maintenanceMessages(locale: AppLocale) {
  return MESSAGES[locale] ?? MESSAGES.he;
}

/** The page for one language; `nonce` goes on its only <style>. */
export function maintenancePageHtml(locale: AppLocale, nonce: string): string {
  const t = maintenanceMessages(locale).page;
  const brand = siteConfig.localizedName?.[locale] ?? siteConfig.name;
  const c = siteConfig.colors;
  const dir = RTL.has(locale) ? "rtl" : "ltr";
  const values = { brand };
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="${MAINTENANCE_RETRY_AFTER_SECONDS}">
<title>${escapeHtml(fill(t.title, values))}</title>
<style nonce="${escapeHtml(nonce)}">
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:${c.background};color:#1c1a22;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Hebrew","Noto Sans Arabic","Noto Sans Georgian",sans-serif}
main{width:100%;max-width:28rem;text-align:center}
.icon{display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;border-radius:999px;background:${c.primaryTint};color:${c.primary};margin-bottom:20px}
h1{font-size:1.5rem;line-height:1.3;margin:0 0 12px;color:${c.primary}}
p{margin:0 0 12px}
.muted{color:#5b5666;font-size:.9375rem}
a.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:12px;padding:0 24px;border-radius:12px;background:${c.primary};color:#fff;text-decoration:none;font-weight:600}
a.button:focus-visible{outline:3px solid ${c.primaryDark};outline-offset:3px}
footer{margin-top:32px;font-size:.8125rem;color:#6b6676}
@media (prefers-color-scheme:dark){body{background:${c.backgroundDark};color:#ece9f3}.icon{background:#241d33;color:${c.primaryDark}}h1{color:${c.primaryDark}}.muted,footer{color:#b7b1c4}a.button{background:${c.primaryButtonDark}}}
</style>
</head>
<body>
<main>
<div class="icon">${WRENCH}</div>
<h1>${escapeHtml(t.heading)}</h1>
<p>${escapeHtml(t.body)}</p>
<p class="muted">${escapeHtml(t.trip)}</p>
<a class="button" href="">${escapeHtml(t.tryAgain)}</a>
<footer>${escapeHtml(fill(t.brandLine, values))}</footer>
</main>
</body>
</html>`;
}

/** The 503 headers: Retry-After, never cached, never indexed, a CSP for this page only. */
export function maintenanceHeaders(nonce: string, kind: "html" | "json"): Record<string, string> {
  return {
    "Content-Type": kind === "html" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "Retry-After": String(MAINTENANCE_RETRY_AFTER_SECONDS),
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

/** The whole 503 answer for a page or an API path. */
export function maintenanceResponse(locale: AppLocale, kind: "html" | "json", nonce: string): Response {
  const body = kind === "html" ? maintenancePageHtml(locale, nonce) : JSON.stringify({ error: "maintenance", message: maintenanceMessages(locale).api });
  return new Response(body, { status: 503, headers: maintenanceHeaders(nonce, kind) });
}
