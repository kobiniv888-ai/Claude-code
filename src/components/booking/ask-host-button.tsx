"use client";

import { useTranslations } from "next-intl";
import { MessageCircleQuestionIcon } from "lucide-react";
import { ChannelIcon } from "@/components/contact/channel-icon";
import { useContact } from "@/components/contact/contact-provider";
import { Button } from "@/components/ds/button";
import { contactLayout } from "@/lib/listing-page/helpers";
import { cn } from "@/lib/utils";

/**
 * "Ask the host": the owner's main channel (WhatsApp first) through the existing contact flow
 * (login, safety tip, click count, the ready message with the dates). Needs <ContactProvider>.
 * Renders nothing when the host has no channel or contact is not possible.
 */
export function AskHostButton({ variant = "primary", className }: { variant?: "primary" | "secondary" | "outline"; className?: string }) {
  const t = useTranslations("booking.review");
  const { listing, availability, contact, revealing } = useContact();
  const { primary } = contactLayout(listing.channels);
  if (availability !== "ok" || !primary) return null;
  return (
    <Button variant={variant} className={cn("min-w-0", className)} disabled={revealing} onClick={() => contact(primary)}>
      {primary === "WHATSAPP" ? <ChannelIcon channel={primary} className="size-5" /> : <MessageCircleQuestionIcon aria-hidden />}
      <span className="truncate">{t("ask")}</span>
    </Button>
  );
}
