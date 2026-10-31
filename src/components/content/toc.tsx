import { ChevronDown, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export type TocItem = { id: string; label: string };

/**
 * Table of contents with anchor links. Collapsible card on phones, sticky side column on desktop.
 * Render it once; it adapts by breakpoint.
 */
export function Toc({ title, items, className }: { title: string; items: TocItem[]; className?: string }) {
  const list = (
    <ol className="space-y-0.5 text-sm">
      {items.map((item, index) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="flex gap-2.5 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span aria-hidden="true" className="w-5 shrink-0 text-end font-medium tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0">{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className={className}>
      {/* Phones and tablets */}
      <nav aria-label={title} className="lg:hidden">
        <details className="group rounded-2xl border bg-card shadow-card">
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3.5 font-semibold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <ListOrdered aria-hidden="true" className="size-5 text-primary" />
            <span className="flex-1">{title}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t px-2 py-2">{list}</div>
        </details>
      </nav>
      {/* Desktop */}
      <nav aria-label={title} className={cn("hidden lg:block")}>
        <p className="mb-3 flex items-center gap-2 px-2.5 text-sm font-semibold">
          <ListOrdered aria-hidden="true" className="size-4 text-primary" />
          {title}
        </p>
        {list}
      </nav>
    </div>
  );
}
