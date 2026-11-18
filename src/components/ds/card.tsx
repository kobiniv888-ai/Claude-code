import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one card surface (round 2): white (--card; #18161F in dark mode), a 1px border, 16px
 * corners, 12px inside and NO shadow. Server-component friendly.
 *
 *   <Card>…</Card>
 *   <Card as="article" padding="none"><img className="rounded-t-card" …/><div className="p-3">…</div></Card>
 *   <Card as="li" interactive>…<Link className="after:absolute after:inset-0" …/></Card>
 *   <div className={cardStyles({ padding: "lg" })}>…</div>
 */
const PADDING = { none: "", md: "p-card", lg: "p-4 sm:p-5" } as const;

export type CardPadding = keyof typeof PADDING;

function cardStyles({
  padding = "md",
  interactive = false,
  muted = false,
  className,
}: { padding?: CardPadding; interactive?: boolean; muted?: boolean; className?: string } = {}) {
  return cn(
    "relative rounded-card border border-border text-card-foreground",
    muted ? "bg-surface-muted" : "bg-card",
    PADDING[padding],
    // A hover border instead of a lift; the focus ring shows when a link inside has focus.
    interactive &&
      "transition-colors duration-(--motion-fast) hover:border-border-strong has-[a:focus-visible,button:focus-visible]:ring-3 has-[a:focus-visible,button:focus-visible]:ring-ring/50",
    className,
  );
}

type CardOwnProps = {
  as?: "div" | "article" | "section" | "li" | "aside";
  padding?: CardPadding;
  /** For a card that is one big link: hover border and a focus ring. */
  interactive?: boolean;
  /** The light-grey surface (e.g. a soft info block). */
  muted?: boolean;
};

function Card({
  as: Comp = "div",
  padding,
  interactive,
  muted,
  className,
  ...props
}: CardOwnProps & React.HTMLAttributes<HTMLElement>) {
  return <Comp data-slot="ds-card" className={cardStyles({ padding, interactive, muted, className })} {...props} />;
}

export { Card, cardStyles };
