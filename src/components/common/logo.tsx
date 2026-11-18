import { Logo, type LogoColor } from "@/components/brand/logo";
import { BayitMark } from "@/components/brand/mark";
import { cn } from "@/lib/utils";

/**
 * Round-1 names for the logo, kept so every existing usage switches to the new brand
 * (src/components/brand/logo.tsx: the ב mark and the name as live text). New code imports
 * `Logo` / `BayitMark` from "@/components/brand/logo" directly.
 */

export { Logo } from "@/components/brand/logo";

/** Old size names → the name's font size in px (the mark is 1.4 ×). md is the header size. */
const FONT_SIZE = { sm: 18, md: 22, lg: 28 } as const;

/** The mark alone at `size` px tall (decorative). */
export function LogoMark({ size = 31, className }: { size?: number; className?: string }) {
  return <BayitMark className={cn("text-primary dark:text-white", className)} style={{ height: size, width: size * (294 / 304) }} />;
}

/** The logo as a link to the home page (header, footer, menu, error pages). */
export function LogoLink({
  size = "md",
  showName = true,
  color,
  className,
  onClick,
}: {
  size?: keyof typeof FONT_SIZE;
  showName?: boolean;
  color?: LogoColor;
  className?: string;
  onClick?: () => void;
}) {
  return <Logo size={FONT_SIZE[size]} showName={showName} color={color} className={className} onClick={onClick} />;
}
