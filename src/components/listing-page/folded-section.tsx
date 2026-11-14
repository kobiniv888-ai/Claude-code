"use client";

import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export type FoldedSectionProps = {
  /** The accordion item's value (unique on the page). */
  value: string;
  title: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
};

/**
 * One folded section of the listing page (closed by default): a single collapsible accordion item.
 * Only imported through ./folded-section-island.tsx (a static import puts the accordion code back
 * into the page's first load).
 */
export function FoldedSection({ value, title, triggerClassName, contentClassName, children }: FoldedSectionProps) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={value} className="border-b-0">
        <AccordionTrigger className={triggerClassName}>{title}</AccordionTrigger>
        <AccordionContent className={contentClassName}>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
