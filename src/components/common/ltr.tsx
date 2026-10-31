import type { ComponentProps } from "react";

/**
 * Keeps phone numbers, prices, IDs and links left-to-right inside Hebrew/Arabic text.
 * Usage: <Ltr>+995 555 12 34 56</Ltr>
 */
export function Ltr({ children, ...props }: ComponentProps<"bdi">) {
  return (
    <bdi dir="ltr" {...props}>
      {children}
    </bdi>
  );
}
