import { getTranslations } from "next-intl/server";
import { buttonStyles } from "@/components/ds/button";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Link } from "@/i18n/navigation";
import { formReturnPath } from "@/lib/listing-form/return-path";
import { cn } from "@/lib/utils";

/**
 * "חזרה למודעה" (bug 2.10): on a page reached from the post form (phone verification, a booking
 * opened from the calendar sheet…), a clear way back to the same step of the form. Renders nothing
 * unless `from` is a post-form address (formReturnPath). Server component, no client JavaScript.
 */
export async function BackToListing({ from, className }: { from: unknown; className?: string }) {
  const href = formReturnPath(from);
  if (!href) return null;
  const t = await getTranslations("wizard.chrome");
  return (
    <Link href={href} className={cn(buttonStyles({ variant: "secondary" }), "w-fit max-w-full", className)}>
      <SpriteIcon name="arrow-right" className="size-4.5 -scale-x-100 rtl:scale-x-100" />
      <span className="truncate">{t("backToListing")}</span>
    </Link>
  );
}
