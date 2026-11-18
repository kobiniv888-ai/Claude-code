/**
 * MAINTENANCE_MODE, read fail-safe (SECURITY_REPORT 12.5.c): "on" / "true" / "1" / "yes" → on;
 * "off" / "false" / "0" / "no" or empty → off; anything else counts as ON (someone meant to close
 * the site; the startup check warns). No imports: the startup check and the proxy both use it.
 */

export type MaintenanceEnvValue = "on" | "off" | "unset" | "invalid";

const ON = new Set(["on", "true", "1", "yes"]);
const OFF = new Set(["off", "false", "0", "no"]);

export function readMaintenanceEnv(raw: string | undefined | null): MaintenanceEnvValue {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return "unset";
  if (ON.has(value)) return "on";
  if (OFF.has(value)) return "off";
  return "invalid";
}

export function envForcesMaintenance(value: MaintenanceEnvValue): boolean {
  return value === "on" || value === "invalid";
}
