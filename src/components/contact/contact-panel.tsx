"use client";

import { useTranslations } from "next-intl";
import { LockKeyholeIcon, PhoneIcon, ShieldOffIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ds/button";
import { Link } from "@/i18n/navigation";
import { displayValue } from "@/lib/contact/links";
import { contactLayout } from "@/lib/listing-page/helpers";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./channel-icon";
import { useContact } from "./contact-provider";

/**
 * The contact buttons (desktop side box and the phone "all ways to contact" sheet).
 * - Before the reveal: the main channel as a big button (green WhatsApp when offered), "Show
 *   phone" (login → reveal), and the other apps as small pills. Every tap goes through the
 *   provider (login, CAPTCHA, first-time safety tip, click tracking, Telegram/Viber copy).
 * - After the reveal: one row per channel with its number or username.
 * Contact values only exist in the browser after the reveal.
 */
export function ContactPanel({ className }: { className?: string }) {
  const t = useTranslations("contact");
  const { listing, availability, methods, revealing, reveal, contact } = useContact();

  if (availability !== "ok") {
    const Icon = availability === "blocked" ? ShieldOffIcon : LockKeyholeIcon;
    return (
      <div className={cn("grid gap-3", className)}>
        <p className="flex gap-2 rounded-xl bg-muted p-3 text-small text-muted-foreground">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(`unavailable.${availability}`)}
        </p>
        {availability === "own" ? (
          <Button asChild variant="outline" block>
            <Link href="/account/listings">{t("manageListings")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (listing.channels.length === 0) {
    return <p className={cn("rounded-xl bg-muted p-3 text-small text-muted-foreground", className)}>{t("noChannels")}</p>;
  }

  if (!methods) {
    const { primary, phone, more } = contactLayout(listing.channels);
    return (
      <div className={cn("grid gap-2.5", className)}>
        {primary ? (
          <Button
            variant={primary === "WHATSAPP" ? "whatsapp" : "primary"}
            size="lg"
            block
            onClick={() => contact(primary)}
            disabled={revealing}
            aria-busy={revealing || undefined}
          >
            <ChannelIcon channel={primary} mono className="size-5" />
            {t(`channelAction.${primary}`)}
          </Button>
        ) : null}
        {phone ? (
          <Button variant="outline" size="lg" block onClick={() => reveal()} disabled={revealing} aria-busy={revealing || undefined}>
            <PhoneIcon aria-hidden />
            {revealing ? t("revealing") : t("showPhone")}
          </Button>
        ) : null}
        {more.length ? (
          <ul className="flex flex-wrap justify-center gap-2" aria-label={t("otherChannels")}>
            {more.map((channel) => (
              <li key={channel}>
                <Button variant="outline" size="sm" onClick={() => contact(channel)} disabled={revealing}>
                  <ChannelIcon channel={channel} className="size-4.5" />
                  {t(`channel.${channel}`)}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-center text-caption text-muted-foreground">{t("showContactHint")}</p>
      </div>
    );
  }

  return (
    <ul className={cn("grid gap-2", className)} aria-label={t("contactOwner")}>
      {methods.map((method) => {
        const shown = displayValue(method.channel, method.value);
        const whatsapp = method.channel === "WHATSAPP";
        return (
          <li key={method.channel}>
            <button
              type="button"
              onClick={() => contact(method.channel)}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-start outline-none transition-[transform,background-color] duration-(--motion-fast) ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100",
                whatsapp ? "border-transparent bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90" : "bg-card hover:bg-muted",
              )}
            >
              <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full", whatsapp ? "bg-white/15" : "bg-muted")}>
                <ChannelIcon channel={method.channel} mono={whatsapp} className="size-5" />
              </span>
              <span className="grid min-w-0">
                <span className="font-semibold">{t(`channelAction.${method.channel}`)}</span>
                {shown ? (
                  <Ltr className={cn("truncate text-small", whatsapp ? "text-whatsapp-foreground/85" : "text-muted-foreground")}>{shown}</Ltr>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
