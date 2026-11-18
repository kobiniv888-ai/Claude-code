import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LOGO_BASE_CLASS, LOGO_COLOR_CLASS, LogoParts, brandName, type LogoColor } from "./mark";

export { BAYIT_MARK_ASPECT, BAYIT_MARK_PATH, BAYIT_MARK_VIEWBOX, BayitMark, BrandLockup, brandName, type LogoColor } from "./mark";

/**
 * The Bayit logo (docs/redesign-2/BRIEF.md 3.1): the ב mark drawn as a house, then the name as
 * live text — "בית" in Hebrew, "Bayit" in every other language. A link to the home page with
 * aria-label "בית" / "Bayit". Works in server and client components.
 *
 *   <Logo />                           header size (22px name, 31px mark), purple, links home
 *   <Logo color="white" />             on purple or dark backgrounds
 *   <Logo size={18} onClick={close} /> smaller, e.g. in the menu sheet
 *   <Logo href={null} />               not a link
 *   <BayitMark className="h-6 w-auto" /> the mark alone (currentColor)
 *
 * Rules: Rubik 600; Latin letter-spacing −0.01em, Hebrew none; the mark is 1.4 × the font size
 * tall and the gap 0.25 × the font size; the mark comes first in reading order (left of "Bayit"
 * in LTR, right of "בית" in RTL: flex order follows the page direction). Never stretch, rotate,
 * outline or recolor it. Purple only on white or lavender: the purple variant turns white in dark
 * mode and inside the purple header, hero band or a bg-primary block (bayit.css, [data-logo]).
 */
export type LogoProps = {
  /** Font size of the name in px (the mark is 1.4 × this). Default 22: the header size. */
  size?: number;
  /** "purple" (default) on white or lavender; "white" on purple and dark backgrounds. */
  color?: LogoColor;
  /** Show the name next to the mark (default true). The link keeps its accessible name either way. */
  showName?: boolean;
  /** Where the logo links (default "/": home in the current language). null: not a link. */
  href?: string | null;
  onClick?: () => void;
  className?: string;
};

export function Logo({ size = 22, color = "purple", showName = true, href = "/", onClick, className }: LogoProps) {
  const locale = useLocale();
  const name = brandName(locale);
  const classes = cn(LOGO_BASE_CLASS, LOGO_COLOR_CLASS[color], className);
  const style = { fontSize: `${size}px` };

  if (href === null) {
    return (
      <span data-logo="" role="img" aria-label={name} className={classes} style={style}>
        <LogoParts locale={locale} showName={showName} />
      </span>
    );
  }
  return (
    <Link
      data-logo=""
      href={href}
      aria-label={name}
      onClick={onClick}
      style={style}
      className={cn(
        classes,
        // A 44px tap target without changing the layout around it; the focus outline comes from the
        // base styles (white on the purple header).
        "relative rounded-md transition-opacity duration-(--motion-fast) after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 hover:opacity-90",
      )}
    >
      <LogoParts locale={locale} showName={showName} />
    </Link>
  );
}
