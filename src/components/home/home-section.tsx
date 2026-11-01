import type { ComponentProps, ReactNode } from "react";
import { Container } from "@/components/common/container";
import { Reveal } from "@/components/ds/reveal";
import { SectionHeader } from "@/components/ds/section-header";
import { cn } from "@/lib/utils";

/**
 * Wrapper padding that lines a CardCarousel (which adds the --gutter itself) up with the
 * Container's side padding: px-4 → px-6 → px-8 vs. gutter 1rem → 1.5rem.
 */
export const CAROUSEL_ALIGN = "px-0 sm:px-2 md:px-0 lg:px-2";

/**
 * A home page section: a big title (with an optional "See all →"), then its content, which
 * fades up the first time it scrolls into view.
 */
export function HomeSection({
  id,
  title,
  subtitle,
  href,
  linkLabel,
  eyebrow,
  className,
  bleed = false,
  children,
}: {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  href?: ComponentProps<typeof SectionHeader>["href"];
  linkLabel?: string;
  eyebrow?: ReactNode;
  className?: string;
  /** Content runs edge to edge on phones (carousels): only the header sits in the Container. */
  bleed?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("py-[calc(var(--section-space)*0.55)]", className)}>
      <Container>
        {eyebrow}
        <SectionHeader id={id} title={title} subtitle={subtitle} href={href} linkLabel={linkLabel} className="mb-4 sm:mb-6" />
      </Container>
      {bleed ? (
        <Container className={CAROUSEL_ALIGN}>
          <Reveal>{children}</Reveal>
        </Container>
      ) : (
        <Container>
          <Reveal>{children}</Reveal>
        </Container>
      )}
    </section>
  );
}
