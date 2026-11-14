"use client";

import { useState } from "react";
import { Info, OctagonAlert, TriangleAlert, X } from "lucide-react";
import type { AlertSeverity } from "@/generated/prisma/enums";
import { Container } from "@/components/common/container";
import { ArrowEnd } from "@/components/common/directional-icon";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { dismissAlert } from "./dismissed-alerts";

const styles: Record<AlertSeverity, { bar: string; icon: typeof Info; iconClass: string }> = {
  INFO: { bar: "border-primary/15 bg-secondary text-secondary-foreground", icon: Info, iconClass: "text-primary" },
  WARNING: { bar: "border-border-strong/30 bg-surface-muted text-foreground", icon: TriangleAlert, iconClass: "text-foreground" },
  CRITICAL: {
    bar: "border-destructive/30 bg-destructive/10 text-foreground",
    icon: OctagonAlert,
    iconClass: "text-destructive",
  },
};

export function ScamAlertBannerView({
  alertKey,
  severity,
  title,
  body,
  labels,
}: {
  alertKey: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  labels: { label: string; more: string; dismiss: string };
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const style = styles[severity];
  const Icon = style.icon;

  return (
    <section data-scam-alert={alertKey} aria-label={labels.label} className={cn("border-b", style.bar)}>
      <Container className="flex items-start gap-3 py-2.5 pe-1 sm:items-center sm:pe-2 lg:pe-4">
        <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0 sm:mt-0", style.iconClass)} strokeWidth={2} />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <strong dir="auto" className="font-semibold">
            {title}
          </strong>
          {body ? (
            <span dir="auto" className="ms-1.5 line-clamp-2 text-foreground/80 sm:line-clamp-1 sm:inline">
              {body}
            </span>
          ) : null}
          <Link
            href="/safety#alerts"
            className="group ms-1.5 inline-flex items-center gap-1 rounded-md font-semibold whitespace-nowrap text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {labels.more}
            <ArrowEnd aria-hidden className="size-3.5" />
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            dismissAlert(alertKey);
            setOpen(false);
          }}
          aria-label={labels.dismiss}
          className="-my-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/70 outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:-my-2"
        >
          <X aria-hidden className="size-[18px]" />
        </button>
      </Container>
    </section>
  );
}
