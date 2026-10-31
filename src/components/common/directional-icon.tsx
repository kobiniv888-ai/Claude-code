import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Arrows and chevrons that point the right way in both directions: "start" is left in
 * English and right in Hebrew/Arabic. Use these for back/next, "See all", breadcrumbs…
 *
 *   <Link href="/search">{t("seeAll")} <ArrowEnd aria-hidden /></Link>
 */

const flip = "rtl:-scale-x-100";

export function ChevronStart({ className, ...props }: LucideProps) {
  return <ChevronLeft className={cn(flip, className)} {...props} />;
}

export function ChevronEnd({ className, ...props }: LucideProps) {
  return <ChevronRight className={cn(flip, className)} {...props} />;
}

export function ArrowStart({ className, ...props }: LucideProps) {
  return <ArrowLeft className={cn(flip, className)} {...props} />;
}

export function ArrowEnd({ className, ...props }: LucideProps) {
  return <ArrowRight className={cn(flip, className)} {...props} />;
}
