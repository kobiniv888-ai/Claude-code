/**
 * Who may use the incident tools (maintenance mode, "sign everyone out"): ADMIN only, on top of
 * the "settings" permission (founder's role; SECURITY_REPORT 12.5.c, 17.1). Pure.
 */
export function canUseIncidentTools(role: string | null | undefined): boolean {
  return role === "ADMIN";
}
