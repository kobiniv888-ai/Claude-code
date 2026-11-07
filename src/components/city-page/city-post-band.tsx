import { buttonStyles } from "@/components/ds/button";
import { HousePlusIcon } from "@/components/ds/sprite-icons";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Under the cards of a city page that shows places but has fewer than 3 real ones (brief 10:
 * "פרסמו את שלכם" below the indexing threshold). The "עדיין אין כאן מקומות" title would be false
 * above real cards, so only the line and the button (CityEmpty covers the page with no places).
 */
export function CityPostBand({ text, action }: { text: string; action: string }) {
  return (
    <div
      data-city-post=""
      className="flex flex-col gap-3 rounded-card border border-dashed border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <p className="flex items-start gap-3 text-body text-pretty text-muted-foreground">
        <HousePlusIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-text" />
        <span className="min-w-0">{text}</span>
      </p>
      <Link href="/post" className={cn(buttonStyles({ variant: "secondary", size: "md" }), "shrink-0 self-start sm:self-auto")}>
        <HousePlusIcon aria-hidden="true" />
        {action}
      </Link>
    </div>
  );
}
