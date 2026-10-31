"use client";

import { useTranslations } from "next-intl";
import { EyeIcon, LockKeyholeIcon, ShieldOffIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { displayValue } from "@/lib/contact/links";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./channel-icon";
import { useContact } from "./contact-provider";

/**
 * The contact buttons: "Show contact" until revealed, then one button per channel in the
 * owner's order. Contact values only exist in the browser after the reveal.
 */
export function ContactPanel({ className }: { className?: string }) {
  const t = useTranslations("contact");
  const { listing, availability, methods, revealing, reveal, contact } = useContact();

  if (availability !== "ok") {
    const Icon = availability === "blocked" ? ShieldOffIcon : LockKeyholeIcon;
    return (
      <div className={cn("grid gap-3", className)}>
        <p className="flex gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(`unavailable.${availability}`)}
        </p>
        {availability === "own" ? (
          <Button asChild variant="outline" className="h-11 rounded-xl">
            <Link href="/account/listings">{t("manageListings")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (listing.channels.length === 0) {
    return <p className={cn("rounded-xl bg-muted p-3 text-sm text-muted-foreground", className)}>{t("noChannels")}</p>;
  }

  if (!methods) {
    return (
      <div className={cn("grid gap-3", className)}>
        <Button type="button" size="lg" className="h-12 rounded-xl text-base" onClick={reveal} disabled={revealing} aria-busy={revealing}>
          <EyeIcon aria-hidden />
          {revealing ? t("revealing") : t("showContact")}
        </Button>
        <ul className="flex flex-wrap items-center justify-center gap-2" aria-label={t("availableChannels")}>
          {listing.channels.map((channel) => (
            <li key={channel} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <ChannelIcon channel={channel} className="size-3.5" />
              {t(`channel.${channel}`)}
            </li>
          ))}
        </ul>
        <p className="text-center text-xs text-muted-foreground">{t("showContactHint")}</p>
      </div>
    );
  }

  return (
    <ul className={cn("grid gap-2", className)} aria-label={t("contactOwner")}>
      {methods.map((method, index) => {
        const shown = displayValue(method.channel, method.value);
        return (
          <li key={method.channel}>
            <Button
              type="button"
              variant={index === 0 ? "default" : "outline"}
              className="h-auto min-h-12 w-full justify-start gap-3 rounded-xl px-4 py-2 text-start"
              onClick={() => contact(method.channel)}
            >
              <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full", index === 0 ? "bg-primary-foreground" : "bg-muted")}>
                <ChannelIcon channel={method.channel} className="size-4.5" />
              </span>
              <span className="grid min-w-0">
                <span className="font-semibold">{t(`channelAction.${method.channel}`)}</span>
                {shown ? (
                  <Ltr className={cn("truncate text-xs font-normal", index === 0 ? "text-primary-foreground/80" : "text-muted-foreground")}>{shown}</Ltr>
                ) : null}
              </span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
