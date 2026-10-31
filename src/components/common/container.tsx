import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const widths = {
  /** Header, footer, home and most pages. */
  default: "max-w-7xl",
  /** Search results with a map, dashboards. */
  wide: "max-w-screen-2xl",
  /** Edge to edge (with the side gutters). */
  full: "max-w-none",
  /** Forms, account pages. */
  narrow: "max-w-4xl",
  /** Long text. */
  prose: "max-w-3xl",
} as const;

export type ContainerSize = keyof typeof widths;

/** Centered page-width wrapper with the site's side gutters (16px on phones, 24px, then 32px). */
export function Container({
  size = "default",
  className,
  ...props
}: ComponentProps<"div"> & { size?: ContainerSize }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", widths[size], className)} {...props} />;
}
