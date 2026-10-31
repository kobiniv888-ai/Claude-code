import {
  Archive,
  CircleCheck,
  CircleDot,
  Clock3,
  CreditCard,
  House,
  MessageCircleQuestion,
  MessageCircleReply,
  ShieldAlert,
  UserRoundCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { TicketCategory, TicketStatus } from "@/generated/prisma/enums";

export const ticketCategoryIcons: Record<TicketCategory, LucideIcon> = {
  LISTING_PROBLEM: House,
  SCAM_REPORT: ShieldAlert,
  ACCOUNT_VERIFICATION: UserRoundCheck,
  TECHNICAL: Wrench,
  PAYMENT: CreditCard,
  OTHER: MessageCircleQuestion,
};

export const ticketStatusIcons: Record<TicketStatus, LucideIcon> = {
  OPEN: CircleDot,
  IN_PROGRESS: Clock3,
  WAITING_FOR_USER: MessageCircleReply,
  RESOLVED: CircleCheck,
  CLOSED: Archive,
};
