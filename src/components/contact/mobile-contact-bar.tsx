"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EllipsisIcon, PhoneIcon, UsersRoundIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { StickyContactBar } from "@/components/ds/sticky-contact-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { contactLayout } from "@/lib/listing-page/helpers";
import { ChannelIcon } from "./channel-icon";
import { ContactPanel } from "./contact-panel";
import { useContact } from "./contact-provider";

/**
 * Phones and tablets: the listing's sticky contact bar (ds StickyContactBar), livo-style.
 * - The price on the start side.
 * - A green WhatsApp button (the owner's first channel when there is no WhatsApp): opens the app
 *   with the ready message in the guest's language, including the listing link.
 * - "Show phone": login → reveal → a sheet with the owner and every number.
 * - "⋯": Telegram, Viber and the other apps, and "All ways to contact".
 * Every tap goes through the contact provider (login, CAPTCHA, safety tip, click tracking).
 *
 * The page renders <HideBottomNav />; the style below gives the bar's height to
 * --bottom-nav-height, so the page end, toasts and the cookie banner make room for it.
 */
const BAR_SPACE_CSS =
  "@media (width < 64rem){body:has([data-listing-contact-bar]){--bottom-nav-height:calc(4.5rem + 1px + env(safe-area-inset-bottom, 0px))}}";

export function MobileContactBar({ price, owner }: { price: ReactNode; owner: ReactNode }) {
  const t = useTranslations("contact");
  const { listing, availability, contact, reveal, revealing } = useContact();
  const [sheetOpen, setSheetOpen] = useState(false);
  if (availability !== "ok" || listing.channels.length === 0) return null;
  const { primary, phone, more } = contactLayout(listing.channels);
  if (!primary) return null;
  const openSheet = () => setSheetOpen(true);

  return (
    <>
      <style>{BAR_SPACE_CSS}</style>
      <StickyContactBar
        label={t("contactOwner")}
        spacer={false}
        className="bottom-0 animate-sheet-up pb-[env(safe-area-inset-bottom,0px)] motion-reduce:animate-none"
        price={price}
        primary={
          <Button
            variant={primary === "WHATSAPP" ? "whatsapp" : "primary"}
            className="gap-1.5 px-4 max-[359px]:px-3"
            onClick={() => contact(primary)}
            disabled={revealing}
            aria-busy={revealing || undefined}
          >
            <ChannelIcon channel={primary} mono className="size-5" />
            <span className="max-[359px]:sr-only">{t(`channel.${primary}`)}</span>
          </Button>
        }
        secondary={
          phone ? (
            <Button
              variant="outline"
              className="px-0 max-sm:size-11 sm:px-4"
              onClick={() => reveal(openSheet)}
              disabled={revealing}
              aria-label={t("showPhone")}
            >
              <PhoneIcon aria-hidden="true" />
              <span className="max-sm:sr-only">{t("showPhone")}</span>
            </Button>
          ) : undefined
        }
        menu={
          more.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t("moreChannels")}>
                  <EllipsisIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={10} className="min-w-56 rounded-xl p-1.5">
                {more.map((channel) => (
                  <DropdownMenuItem key={channel} className="min-h-11 gap-3 rounded-lg" onSelect={() => contact(channel)}>
                    <ChannelIcon channel={channel} className="size-5" />
                    {t(`channelAction.${channel}`)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11 gap-3 rounded-lg" onSelect={() => reveal(openSheet)}>
                  <UsersRoundIcon className="size-5" aria-hidden="true" />
                  {t("allOptions")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title={t("contactOwner")}>
        <div className="grid gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {owner}
          <ContactPanel />
        </div>
      </BottomSheet>
    </>
  );
}
