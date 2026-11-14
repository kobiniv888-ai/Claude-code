"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, InfoIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ui/input";
import { isPermanentSiteUrl } from "@/lib/site-url";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * A link to copy (the calendar export link hosts paste into Airbnb / Booking.com, round 3 brief
 * 2.1). Build `value` on the server with @/lib/site-url (or icalExportUrl in @/lib/ical).
 *
 * While the site is not on its permanent address (localhost, a Codespaces or preview address),
 * a copied link would break later: the field still shows it, but says "the link will work once
 * the site is on its permanent address" and Copy is disabled. `permanent` defaults to checking
 * the link itself with isPermanentSiteUrl().
 *
 *   <CopyLinkField value={exportUrl} label={t("exportTitle")} />
 */
export function CopyLinkField({
  value,
  label,
  permanent,
  className,
}: {
  value: string;
  label: string;
  permanent?: boolean;
  className?: string;
}) {
  const t = useTranslations("links");
  const noteId = useId();
  const [copied, setCopied] = useState(false);
  const works = permanent ?? isPermanentSiteUrl(value);

  const copy = async () => {
    if (!works) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={value}
          dir="ltr"
          aria-label={label}
          aria-describedby={works ? undefined : noteId}
          className={cn("h-11 min-w-0 flex-1 font-mono text-sm", !works && "text-muted-foreground")}
          onFocus={(event) => event.target.select()}
        />
        <Button type="button" variant="outline" size="sm" className="h-11" onClick={copy} disabled={!works} aria-describedby={works ? undefined : noteId}>
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
        </Button>
      </div>
      {works ? null : (
        <p id={noteId} className="flex items-start gap-2 rounded-input bg-surface-muted px-3 py-2 text-small text-pretty text-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {t("notPermanent")}
        </p>
      )}
    </div>
  );
}
