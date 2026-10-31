import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const widths = {
  default: "max-w-6xl",
  narrow: "max-w-4xl",
  prose: "max-w-3xl",
} as const;

/** Page-width wrapper with the site's side padding (16px on phones). */
export function ContentContainer({
  size = "default",
  className,
  ...props
}: ComponentProps<"div"> & { size?: keyof typeof widths }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", widths[size], className)} {...props} />;
}
