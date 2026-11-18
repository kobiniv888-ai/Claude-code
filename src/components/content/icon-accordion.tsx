"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export type IconAccordionItem = {
  id: string;
  /** Usually an <IconCircle> (rendered by the server page). */
  icon: ReactNode;
  title: ReactNode;
  body: ReactNode;
};

/**
 * Short rows that open on tap: an icon in a tinted circle and a title, the explanation behind it.
 * Keeps long help and safety lists to one line each until someone wants the detail. Opening fades
 * the text in (opacity/transform only); several rows can be open at once.
 *
 *   <IconAccordion items={[{ id: "deposit", icon: <IconCircle icon={Banknote} tone="coral" size="sm" />,
 *     title: "Deposit before you've seen it", body: "…" }]} />
 */
export function IconAccordion({
  items,
  headingLevel = "h3",
  className,
}: {
  items: IconAccordionItem[];
  headingLevel?: "h3" | "h4";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <AccordionPrimitive.Root type="multiple" className={cn("grid content-start items-start gap-2", className)}>
      {items.map((item) => (
        <AccordionPrimitive.Item key={item.id} value={item.id} className="rounded-card border bg-card">
          <AccordionPrimitive.Header asChild>
            <Heading className="m-0">
              <AccordionPrimitive.Trigger className="group flex min-h-14 w-full items-center gap-3 rounded-card p-3 text-start text-body font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4">
                {item.icon}
                <span className="min-w-0 flex-1 text-pretty">{item.title}</span>
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground group-data-[state=open]:bg-primary-tint group-data-[state=open]:text-primary-text"
                >
                  <ChevronDown className="size-4.5 transition-transform duration-(--motion-base) group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                </span>
              </AccordionPrimitive.Trigger>
            </Heading>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-(--motion-base)">
            <div className="px-4 pt-0 pb-4 text-small leading-relaxed text-pretty text-muted-foreground sm:ps-16">{item.body}</div>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
