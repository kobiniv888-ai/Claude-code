import { useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckCircle2Icon,
  EyeOffIcon,
  FilePenLineIcon,
  HourglassIcon,
  KeyRoundIcon,
  PauseCircleIcon,
  SearchCheckIcon,
  type LucideIcon,
} from "lucide-react";
import type { ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STYLE: Record<ListingStatus, { icon: LucideIcon; className: string }> = {
  LIVE: { icon: CheckCircle2Icon, className: "bg-primary-tint text-success" },
  IN_REVIEW: { icon: SearchCheckIcon, className: "bg-secondary text-primary" },
  NEEDS_CHANGES: { icon: AlertTriangleIcon, className: "bg-surface-muted text-foreground" },
  PAUSED: { icon: PauseCircleIcon, className: "bg-muted text-muted-foreground" },
  EXPIRED: { icon: HourglassIcon, className: "bg-destructive/10 text-destructive" },
  DRAFT: { icon: FilePenLineIcon, className: "bg-muted text-muted-foreground" },
  RENTED: { icon: KeyRoundIcon, className: "bg-secondary text-primary" },
  SOLD: { icon: KeyRoundIcon, className: "bg-secondary text-primary" },
  REJECTED: { icon: BanIcon, className: "bg-destructive/10 text-destructive" },
  HIDDEN: { icon: EyeOffIcon, className: "bg-surface-muted text-foreground" },
  DELETED: { icon: BanIcon, className: "bg-muted text-muted-foreground" },
};

/** Status chip with an icon and the label (never color alone). Labels: moderation.statuses. */
export function ListingStatusBadge({ status, className }: { status: ListingStatus; className?: string }) {
  const t = useTranslations("moderation.statuses");
  const { icon: Icon, className: tone } = STYLE[status];
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", tone, className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {t(`${status}.label`)}
    </span>
  );
}
