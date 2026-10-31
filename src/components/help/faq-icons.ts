import { BadgeCheck, CreditCard, Megaphone, MessagesSquare, Rocket, ShieldCheck, type LucideIcon } from "lucide-react";
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
