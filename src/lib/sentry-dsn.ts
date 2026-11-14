/**
 * Is a Sentry DSN usable, and is it in Sentry's EU region (founder's decision 6: the EU data
 * region; its ingest hosts are *.ingest.de.sentry.io)? Pure, no imports: the startup check
 * (src/lib/ops-startup.ts) and the monitoring module (src/lib/monitoring.ts) both read it.
 */
export type SentryDsnInfo = { ok: boolean; eu: boolean; host: string };

export function sentryDsnInfo(raw: string | undefined | null): SentryDsnInfo {
  let url: URL;
  try {
    url = new URL(raw?.trim() ?? "");
  } catch {
    return { ok: false, eu: false, host: "" };
  }
  const projectId = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const ok = url.protocol === "https:" && !!url.username && /^\d+$/.test(projectId);
  const host = url.hostname.toLowerCase();
  return { ok, eu: host === "de.sentry.io" || host.endsWith(".de.sentry.io"), host };
}
