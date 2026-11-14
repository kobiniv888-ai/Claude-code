import type { ReactNode } from "react";
import { Container } from "@/components/common/container";
import { ChevronRightIcon } from "@/components/ds/sprite-icons";
import { Link } from "@/i18n/navigation";

export type CityCrumb = { name: string; path: string };

/**
 * The top of a city page: the breadcrumb trail (the last one is this page), the h1, one line
 * about the page and, below, the row of types. Server component (sprite icons only).
 */
export function CityPageHeader({
  crumbs,
  crumbsLabel,
  title,
  lead,
  children,
}: {
  crumbs: CityCrumb[];
  crumbsLabel: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface-muted/60">
      <Container className="grid grid-cols-1 gap-3 pt-4 pb-5 sm:pt-6 sm:pb-6">
        <nav aria-label={crumbsLabel}>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-small text-muted-foreground">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={crumb.path} className="inline-flex min-w-0 items-center gap-1">
                  {last ? (
                    <span aria-current="page" className="truncate text-foreground" dir="auto">
                      {crumb.name}
                    </span>
                  ) : (
                    <>
                      <Link
                        href={crumb.path}
                        dir="auto"
                        className="inline-flex min-h-11 items-center rounded-md underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {crumb.name}
                      </Link>
                      <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-60 rtl:-scale-x-100" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="grid gap-1.5">
          <h1 className="text-h1 text-balance text-foreground">{title}</h1>
          <p className="max-w-2xl text-body text-pretty text-muted-foreground">{lead}</p>
        </div>
        {children}
      </Container>
    </header>
  );
}
