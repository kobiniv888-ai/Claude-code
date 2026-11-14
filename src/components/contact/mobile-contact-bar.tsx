"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FlagIcon, PhoneIcon, UsersRoundIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { OverflowMenu } from "@/components/ds/overflow-menu";
import { StickyContactBar } from "@/components/ds/sticky-contact-bar";
import { requestHostReport, useHostReportAvailable } from "@/components/report/host-report-store";
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
  // "דיווח על המארח" (round 3, brief 8.2): public listings that are not the visitor's own.
  const tr = useTranslations("report.turnedAway");
  const canReportHost = useHostReportAvailable();
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
          more.length || canReportHost ? (
            <OverflowMenu
              // "More ways to contact" only while that is all it holds; with "Report the host" in
              // it, the general "More options" names it truthfully for screen readers.
              label={canReportHost || !more.length ? tr("moreOptions") : t("moreChannels")}
              contentClassName="min-w-56"
              items={[
                ...(more.length
                  ? [
                      ...more.map((channel) => ({
                        key: channel,
                        icon: <ChannelIcon channel={channel} className="size-5" />,
                        label: t(`channelAction.${channel}`),
                        onSelect: () => contact(channel),
                      })),
                      "separator" as const,
                      { key: "all", icon: <UsersRoundIcon className="size-5" aria-hidden="true" />, label: t("allOptions"), onSelect: () => reveal(openSheet) },
                    ]
                  : []),
                ...(canReportHost
                  ? [
                      ...(more.length ? ["separator" as const] : []),
                      { key: "report-host", icon: <FlagIcon className="size-5" aria-hidden="true" />, label: tr("menuItem"), onSelect: requestHostReport },
                    ]
                  : []),
              ]}
            />
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
