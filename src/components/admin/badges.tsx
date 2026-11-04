import { BadgeCheck, Building2, FlaskConical, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type {
  ListingStatus,
  ReportStatus,
  UserRole,
  UserStatus,
  VerificationStatus,
} from "@/generated/prisma/enums";
import { RISK_LEVEL_STYLES, riskLevel } from "@/lib/admin/risk";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Small status pills used across the admin panel (Server and Client Components). */

const pill =
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0";

const LISTING_STATUS_STYLES: Record<ListingStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground ring-border",
  IN_REVIEW: "bg-surface-muted text-foreground ring-border-strong/40",
  NEEDS_CHANGES: "bg-surface-muted text-foreground ring-border-strong/40",
  LIVE: "bg-primary-tint text-foreground ring-success/30",
  PAUSED: "bg-muted text-muted-foreground ring-border",
  EXPIRED: "bg-muted text-muted-foreground ring-border",
  RENTED: "bg-secondary text-secondary-foreground ring-primary/15",
  SOLD: "bg-secondary text-secondary-foreground ring-primary/15",
  REJECTED: "bg-destructive/10 text-destructive ring-destructive/30",
  HIDDEN: "bg-destructive/10 text-destructive ring-destructive/30",
  DELETED: "bg-muted text-muted-foreground ring-border",
};

export function ListingStatusBadge({ status, className }: { status: ListingStatus; className?: string }) {
  const t = useTranslations("moderation.statuses");
  return <span className={cn(pill, LISTING_STATUS_STYLES[status], className)}>{t(`${status}.label`)}</span>;
}

const USER_STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE: "bg-primary-tint text-foreground ring-success/30",
  WARNED: "bg-surface-muted text-foreground ring-border-strong/40",
  SUSPENDED: "bg-destructive/10 text-destructive ring-destructive/30",
  BANNED: "bg-destructive text-destructive-foreground ring-destructive",
  DELETED: "bg-muted text-muted-foreground ring-border",
};

export function UserStatusBadge({ status, className }: { status: UserStatus; className?: string }) {
  const t = useTranslations("admin.userStatus");
  return <span className={cn(pill, USER_STATUS_STYLES[status], className)}>{t(status)}</span>;
}

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const t = useTranslations("admin.roles");
  if (role === "USER") return null;
  return (
    <span className={cn(pill, "bg-primary/10 text-primary ring-primary/20", className)}>
      <ShieldAlert aria-hidden />
      {t(role)}
    </span>
  );
}

const REPORT_STATUS_STYLES: Record<ReportStatus, string> = {
  OPEN: "bg-surface-muted text-foreground ring-border-strong/40",
  RESOLVED: "bg-primary-tint text-foreground ring-success/30",
  DISMISSED: "bg-muted text-muted-foreground ring-border",
};

export function ReportStatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  const t = useTranslations("admin.reportStatus");
  return <span className={cn(pill, REPORT_STATUS_STYLES[status], className)}>{t(status)}</span>;
}

const VERIFICATION_STATUS_STYLES: Record<VerificationStatus, string> = {
  PENDING: "bg-surface-muted text-foreground ring-border-strong/40",
  NEEDS_MORE_INFO: "bg-secondary text-secondary-foreground ring-primary/15",
  APPROVED: "bg-primary-tint text-foreground ring-success/30",
  REJECTED: "bg-destructive/10 text-destructive ring-destructive/30",
};

export function VerificationStatusBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const t = useTranslations("admin.verificationStatus");
  return <span className={cn(pill, VERIFICATION_STATUS_STYLES[status], className)}>{t(status)}</span>;
}

/** "ID verified", "Business", "Demo" markers next to a user's name. */
export function AccountMarkers({
  user,
  className,
}: {
  user: { idVerifiedAt?: Date | null; businessVerifiedAt?: Date | null; accountType?: string; isDemo?: boolean };
  className?: string;
}) {
  const t = useTranslations("admin.markers");
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {user.idVerifiedAt ? (
        <span className={cn(pill, "bg-primary-tint text-foreground ring-success/30")}>
          <BadgeCheck aria-hidden className="text-success" />
          {t("idVerified")}
        </span>
      ) : null}
      {user.accountType === "BUSINESS" ? (
        <span className={cn(pill, "bg-secondary text-secondary-foreground ring-primary/15")}>
          <Building2 aria-hidden />
          {user.businessVerifiedAt ? t("businessVerified") : t("business")}
        </span>
      ) : null}
      {user.isDemo ? (
        <span className={cn(pill, "bg-muted text-muted-foreground ring-border")}>
          <FlaskConical aria-hidden />
          {t("demo")}
        </span>
      ) : null}
    </span>
  );
}

/** The risk score as a colored chip (none / low / medium / high). */
export function RiskChip({
  score,
  threshold,
  className,
}: {
  score: number | null | undefined;
  threshold?: number;
  className?: string;
}) {
  const t = useTranslations("admin.risk");
  const locale = useLocale();
  const level = riskLevel(score, threshold);
  const value = score == null ? "–" : formatNumber(score, locale);
  return (
    <span
      className={cn(pill, "tabular-nums", RISK_LEVEL_STYLES[level], className)}
      title={t(`level.${level}`)}
    >
      <span aria-hidden>{value}</span>
      {/* aria-label is not allowed on a plain <span>; screen readers read this text instead. */}
      <span className="sr-only">{score == null ? t("none") : t("aria", { score: value, level: t(`level.${level}`) })}</span>
    </span>
  );
}
