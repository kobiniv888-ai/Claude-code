import type { CSSProperties, ElementType } from "react";

/**
 * Round 2: a plain wrapper, no animation (the brief removed the staggered fade-in of sections).
 * Kept so existing callers keep working; it renders its element with the given props.
 *
 *   <Reveal as="section" className="…">…</Reveal>
 */
export function Reveal({
  as: Tag = "div",
  // Not passed on to the element.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  index,
  className,
  style,
  children,
  ...props
}: {
  as?: ElementType;
  /** Ignored (was the stagger position). */
  index?: number;
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "style" | "className">) {
  return (
    <Tag className={className} style={style} {...props}>
      {children}
    </Tag>
  );
}
