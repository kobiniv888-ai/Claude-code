"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { UsersRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChannelIcon } from "./channel-icon";
import { ContactPanel } from "./contact-panel";
import { useContact } from "./contact-provider";

/**
 * Phones: a bar fixed to the bottom with the owner's first two channels and "All options"
 * (a sheet with the owner card and every channel). The page renders <HideBottomNav />, and the
 * style below gives the bar's height to --bottom-nav-height, so the page and toasts make room.
 */
const BAR_SPACE_CSS =
  "@media (width < 64rem){body:has([data-listing-contact-bar]){--bottom-nav-height:calc(4rem + 1px + env(safe-area-inset-bottom, 0px))}}";

export function MobileContactBar({ owner }: { owner: ReactNode }) {
  const t = useTranslations("contact");
  const { listing, availability, contact } = useContact();
  const [open, setOpen] = useState(false);
  if (availability !== "ok" || listing.channels.length === 0) return null;
  const quick = listing.channels.slice(0, 2);

  return (
    <>
      <style>{BAR_SPACE_CSS}</style>
      <div
        data-listing-contact-bar
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          {quick.map((channel) => (
            <Button
              key={channel}
              type="button"
              variant="outline"
              className="h-12 w-12 flex-none gap-1.5 rounded-xl px-2 text-sm min-[420px]:w-auto min-[420px]:min-w-0 min-[420px]:flex-1"
              onClick={() => contact(channel)}
            >
              <ChannelIcon channel={channel} className="size-5" />
              <span className="sr-only truncate min-[420px]:not-sr-only">{t(`channel.${channel}`)}</span>
            </Button>
          ))}
          <Button type="button" className="h-12 min-w-0 flex-1 gap-1.5 rounded-xl px-3 text-base min-[420px]:text-sm" onClick={() => setOpen(true)}>
            <UsersRoundIcon aria-hidden />
            <span className="truncate">{t("allOptions")}</span>
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <SheetHeader className="text-start">
            <SheetTitle>{t("contactOwner")}</SheetTitle>
            <SheetDescription className="sr-only">{t("sheetDescription")}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4">
            {owner}
            <ContactPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
