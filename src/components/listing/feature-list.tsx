import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { fieldIcon, type FieldIconGroup } from "./field-icons";

/**
 * Icon + label grid for a list of vocabulary keys (amenities, Shabbat checklist, Jewish
 * features…), labels from listingFields.json:
 *
 *   <FeatureList group="amenity" keys={listing.amenities} />
 */
export function FeatureList({
  group,
  keys,
  columns = 2,
  size = "md",
  className,
}: {
  group: FieldIconGroup;
  keys: readonly string[];
  columns?: 1 | 2 | 3;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useTranslations("listingFields");
  const known = keys.filter((key) => t.has(`${group}.${key}`));
  if (known.length === 0) return null;

  return (
    <ul
      className={cn(
        "grid gap-x-6 gap-y-3",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {known.map((key) => {
        const Icon = fieldIcon(group, key);
        return (
          <li key={key} className={cn("flex items-center gap-3", size === "sm" ? "text-sm" : "text-base")}>
            <Icon className={cn("shrink-0 text-primary", size === "sm" ? "size-4" : "size-5")} aria-hidden="true" />
            <span>{t(`${group}.${key}` as never)}</span>
          </li>
        );
      })}
    </ul>
  );
}
