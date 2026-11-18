import { BadgeCheck, CreditCard, Megaphone, MessagesSquare, Rocket, ShieldCheck, type LucideIcon } from "lucide-react";
import type { IconCircleProps } from "@/components/ds/icon-circle";
import type { FaqCategory } from "@/generated/prisma/enums";

/** FAQ topics in display order, with their icons. */
export const FAQ_CATEGORIES = [
  "GETTING_STARTED",
  "POSTING",
  "CONTACTING_OWNERS",
  "SAFETY",
  "ACCOUNT_VERIFICATION",
  "PAYMENTS",
] as const satisfies readonly FaqCategory[];

export const faqCategoryIcons: Record<FaqCategory, LucideIcon> = {
  GETTING_STARTED: Rocket,
  POSTING: Megaphone,
  CONTACTING_OWNERS: MessagesSquare,
  SAFETY: ShieldCheck,
  ACCOUNT_VERIFICATION: BadgeCheck,
  PAYMENTS: CreditCard,
};

/** The tinted circle behind each topic's icon (help center tiles and group headings). */
export const faqCategoryTones: Record<FaqCategory, NonNullable<IconCircleProps["tone"]>> = {
  GETTING_STARTED: "navy",
  POSTING: "coral",
  CONTACTING_OWNERS: "navy",
  SAFETY: "green",
  ACCOUNT_VERIFICATION: "green",
  PAYMENTS: "amber",
};
