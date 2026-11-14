import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "./sprite-icons";
import { useTranslations } from "next-intl";
import { Slot } from "radix-ui";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IconComponent } from "./jewish-icons";

/**
 * Pill chips for filters and quick choices: 34px tall (a 44px touch area), a hairline border, and
 * the purple tint with purple text when active.
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
    "relative inline-flex h-chip shrink-0 items-center justify-center gap-1.5 rounded-full border text-sm font-medium whitespace-nowrap select-none",
    // A 44px touch area around the 34px pill.
    "before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']",
    "transition-[transform,background-color,border-color,color] duration-(--motion-fast) ease-standard outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  ],
  {
    variants: {
      size: {
        sm: "px-3",
        md: "px-3.5",
      },
      active: {
        true: "border-primary-tint-border bg-primary-tint text-primary-text",
        false: "border-border-strong bg-card text-foreground hover:bg-surface-muted [&_svg]:text-muted-foreground",
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

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-none font-semibold text-primary-foreground tabular-nums">
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
      {count ? <CountBadge count={count} /> : null}
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
        "inline-flex h-chip shrink-0 items-center gap-1 rounded-full border border-primary-tint-border bg-primary-tint text-sm font-medium whitespace-nowrap text-primary-text [&_svg]:size-4",
        size === "sm" ? "ps-3" : "ps-3.5",
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className="relative me-0.5 inline-flex size-7.5 items-center justify-center rounded-full outline-none transition-colors before:absolute before:-inset-[7px] before:content-[''] hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}

export { Chip, RemovableChip, chipStyles };
