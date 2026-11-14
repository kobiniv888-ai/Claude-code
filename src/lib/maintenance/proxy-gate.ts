import type { NextRequest } from "next/server";
import type { AppLocale } from "@/config/site";
import { maintenanceAllows, maintenanceLocale, maintenanceNeedsViewer, wantsJson, type MaintenanceViewer } from "./mode";
import { maintenanceResponse } from "./page";

/**
 * The maintenance-mode hook of src/proxy.ts (SECURITY_REPORT 12.5.c): null when the request may go
 * on, else the 503 answer. The switch and the session are read only through dynamic imports, so
 * the proxy loads the database client once per server, not for every module graph that imports
 * the proxy. Any failure while deciding answers 503 (fail closed): only the switch being OFF lets
 * a request through unchecked.
 */
export async function maintenanceGate(request: NextRequest): Promise<Response | null> {
  let on = false;
  try {
    const { maintenanceState } = await import("./state");
    on = (await maintenanceState()).on;
  } catch (error) {
    // The switch itself could not be read at all: the env switch still decides.
    console.error("[maintenance] could not check the switch:", (error as Error)?.message ?? error);
    const { envForcesMaintenance, readMaintenanceEnv } = await import("./mode");
    on = envForcesMaintenance(readMaintenanceEnv(process.env.MAINTENANCE_MODE));
  }
  if (!on) return null;

  const pathname = request.nextUrl.pathname;
  const req = { pathname, method: request.method, isAction: request.headers.has("next-action") };
  let viewer: MaintenanceViewer = null;
  if (maintenanceNeedsViewer(req)) {
    try {
      const { maintenanceViewer } = await import("./viewer");
      viewer = await maintenanceViewer(request.cookies);
    } catch {
      viewer = null;
    }
  }
  if (maintenanceAllows(req, viewer)) return null;
  const locale: AppLocale = maintenanceLocale(pathname, request.headers.get("accept-language"));
  return maintenanceResponse(locale, wantsJson(pathname) ? "json" : "html", btoa(crypto.randomUUID()));
}
