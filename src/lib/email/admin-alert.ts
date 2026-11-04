import "server-only";

/**
 * Founder alerts moved to src/lib/alerts/founder.ts (ADMIN_ALERT_EMAIL first, else the real admin
 * accounts, else the outbox). Kept as a re-export for older imports.
 */
export {
  founderAlertRecipients as adminAlertRecipients,
  sendFounderAlert as sendAdminAlert,
} from "@/lib/alerts/founder";
