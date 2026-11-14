import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * A bar fixed to the bottom of the screen (listing contact, booking): the price on the start
 * side, then the main action (a 48px purple button), a secondary action and an overflow menu.
 * A plain white (dark: surface) bar with a top border, no shadow or blur.
 * It sits above the mobile bottom nav when that is shown (--bottom-nav-height), keeps clear of
 * the home indicator (safe area) and leaves a spacer so it never covers the end of the page.
 *
 *   <StickyContactBar
 *     price={<Price … size="lg" />}
 *     primary={<Button variant="whatsapp" asChild><a href={wa}><WhatsAppIcon /> WhatsApp</a></Button>}
 *     secondary={<Button variant="outline" size="icon" aria-label="הצגת טלפון"><PhoneIcon /></Button>}
 *     menu={<ContactMenu />}
 *   />
 */
export function StickyContactBar({
  price,
  primary,
  secondary,
  menu,
  label,
  mobileOnly = true,
  spacer = true,
  className,
}: {
  price?: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** An overflow menu trigger (Telegram, Viber…). */
  menu?: React.ReactNode;
  /** Accessible name of the region (default "Contact the host"). */
  label?: string;
  /** Hide on large screens (where the page shows a contact card instead). */
  mobileOnly?: boolean;
  /** Leave an empty block of the bar's height at the end of the page. Turn off when the page
   * makes room itself (e.g. by setting --bottom-nav-height to the bar's height). */
  spacer?: boolean;
  className?: string;
}) {
  const t = useTranslations("ds.contactBar");
  return (
    <>
      {spacer ? <div aria-hidden="true" className={cn("h-24", mobileOnly && "lg:hidden")} /> : null}
      <div
        role="region"
        aria-label={label ?? t("label")}
        data-listing-contact-bar=""
        data-sticky-bar=""
        className={cn(
          "fixed inset-x-0 bottom-(--bottom-nav-height) z-(--z-sticky) border-t border-border bg-card",
          mobileOnly && "lg:hidden",
          className,
        )}
      >
        <div className="mx-auto flex h-18 max-w-3xl items-center gap-2 px-gutter">
          {price ? <div className="me-auto min-w-0 flex-1 truncate">{price}</div> : null}
          <div className={cn("flex shrink-0 items-center gap-2", !price && "flex-1 [&>*:first-child]:flex-1")}>
            {primary}
            {secondary}
            {menu}
          </div>
        </div>
      </div>
    </>
  );
}
