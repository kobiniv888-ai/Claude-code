"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { errorMessageKey } from "@/lib/errors";

/** Ticket-specific action error codes (messages in tickets.errors.*). */
export const TICKET_ERROR_CODES = [
  "ticket_closed",
  "already_rated",
  "not_rateable",
  "listing_invalid",
  "listing_not_found",
  "attachment_invalid",
  "invalid_assignee",
] as const;

/** Message for a failed ticket action: our own codes first, then the shared "errors" namespace. */
export function useTicketErrorMessage() {
  const t = useTranslations("tickets.errors");
  const tShared = useTranslations("errors");
  return useCallback(
    (code: string) =>
      (TICKET_ERROR_CODES as readonly string[]).includes(code)
        ? t(code as (typeof TICKET_ERROR_CODES)[number])
        : tShared(errorMessageKey(code)),
    [t, tShared],
  );
}
