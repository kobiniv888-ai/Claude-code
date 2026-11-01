import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Slot } from "radix-ui";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IconComponent } from "./jewish-icons";

/**
 * Pill chips for filters and quick choices. Filled navy when active.
 *
 *   <Chip pressed={kosher} onClick={() => setKosher(!kosher)} icon={KosherStampIcon}>כשר</Chip>
 *   <Chip active={count > 0} count={count} icon={SlidersHorizontalIcon} aria-haspopup="dialog">סינון</Chip>
 *   <Chip asChild><Link href="/search?kosher=1">כשר</Link></Chip>
 *   <RemovableChip onRemove={() => clear("price")}>עד ₪500</RemovableChip>
 *
 * `pressed` makes it a toggle button (aria-pressed) and fills it; `active` only fills it (for a
 * chip that opens something). Server-component friendly; pass handlers from a client component.
 */
const chipStyles = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-medium whitespace-nowrap select-none",
    "transition-[transform,background-color,border-color,color] duration-(--motion-fast) ease-standard outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      size: {
        // 36px chip with a 44px touch area.
        sm: "h-9 px-3 text-sm [&_svg]:size-4 before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
        md: "h-11 px-4 text-sm [&_svg]:size-4.5",
      },
      active: {
        true: "border-navy bg-navy text-navy-foreground hover:bg-navy/90",
        false: "border-border bg-card text-foreground hover:border-input hover:bg-muted",
      },
    },
    defaultVariants: { size: "md", active: false },
  },
);

export type ChipProps = Omit<React.ComponentProps<"button">, "children"> &
  Pick<VariantProps<typeof chipStyles>, "size"> & {
    /** Toggle state: sets aria-pressed and fills the chip. */
    pressed?: boolean;
    /** Fill the chip without toggle semantics (e.g. "Filters" with filters applied). */
    active?: boolean;
    icon?: IconComponent;
    /** A small count badge after the label ("Filters 3"). Hidden when 0 or undefined. */
    count?: number;
    asChild?: boolean;
    children: React.ReactNode;
  };

function CountBadge({ count, inverted }: { count: number; inverted: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs leading-none font-bold tabular-nums",
        inverted ? "bg-card text-navy" : "bg-navy text-navy-foreground",
      )}
    >
      {formatNumber(count, "en")}
    </span>
  );
}

function Chip({ pressed, active, icon: Icon, count, size, asChild = false, className, children, type, ...props }: ChipProps) {
  const filled = pressed ?? active ?? false;
  const content = (
    <>
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
      {count ? <CountBadge count={count} inverted={filled} /> : null}
    </>
  );
  if (asChild) {
    return (
      <Slot.Root data-slot="chip" className={cn(chipStyles({ size, active: filled }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? "button"}
      data-slot="chip"
      aria-pressed={pressed}
      className={cn(chipStyles({ size, active: filled }), className)}
      {...props}
    >
      {content}
    </button>
  );
}

/** An applied filter with a remove (×) button. The chip itself is not a button. */
function RemovableChip({
  onRemove,
  removeLabel,
  icon: Icon,
  size,
  className,
  children,
}: {
  onRemove: () => void;
  /** Accessible name of the × button. Default: "Remove {label}" when children is a string. */
  removeLabel?: string;
  icon?: IconComponent;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("ds.chip");
  const label = removeLabel ?? t("remove", { label: typeof children === "string" ? children : "" });
  return (
    <span
      data-slot="removable-chip"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-navy bg-navy-soft ps-3 font-medium whitespace-nowrap text-navy",
        size === "sm" ? "h-9 text-sm [&_svg]:size-4" : "h-11 text-sm [&_svg]:size-4.5",
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className="me-0.5 inline-flex size-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-navy/10 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}

export { Chip, RemovableChip, chipStyles };
