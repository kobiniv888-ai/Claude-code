import type { ComponentProps, ReactNode } from "react";
import { Container } from "@/components/common/container";
import { SectionHeader } from "@/components/ds/section-header";
import { cn } from "@/lib/utils";

/**
 * Wrapper padding that lines a CardCarousel (which adds the --gutter itself) up with the
 * Container's side padding: px-4 → px-6 → px-8 vs. gutter 1rem → 1.5rem.
 */
export const CAROUSEL_ALIGN = "px-0 sm:px-2 md:px-0 lg:px-2";

/**
 * A home page section: the 18px section title (with an optional purple "All ←"), then its
 * content. The page puts 32px between sections (gap-section); sections add no padding of their own.
 */
export function HomeSection({
  id,
  title,
  href,
  linkLabel,
  className,
  bleed = false,
  children,
}: {
  id: string;
  title: ReactNode;
  href?: ComponentProps<typeof SectionHeader>["href"];
  linkLabel?: string;
  className?: string;
  /** Content runs edge to edge on phones (carousels, sideways rows): only the header sits in the Container. */
  bleed?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <Container>
        <SectionHeader id={id} title={title} href={href} linkLabel={linkLabel} className={cn("mb-3", !href && "min-h-11")} />
      </Container>
      <Container className={bleed ? CAROUSEL_ALIGN : undefined}>{children}</Container>
    </section>
  );
}
