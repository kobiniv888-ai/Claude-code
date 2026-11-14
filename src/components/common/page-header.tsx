import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ChevronEnd } from "./directional-icon";

export type Crumb = { label: string; href?: string };

/**
 * The top of an app-style page (search, account, admin): optional breadcrumbs, the h1, a short
 * description and actions on the end side.
 *
 *   <PageHeader title={t("title")} description={t("lead")} actions={<Button>…</Button>} />
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("nav");
  return (
    <header className={cn("grid gap-4 pt-6 pb-6 sm:pt-8 sm:pb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label={t("breadcrumb")}>
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1">
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="rounded-md underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className={cn(last && "text-foreground")}>
                      {crumb.label}
                    </span>
                  )}
                  {!last ? <ChevronEnd aria-hidden className="size-3.5 opacity-60" /> : null}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid min-w-0 gap-2">
          {eyebrow ? <p className="text-sm font-semibold text-accent-foreground">{eyebrow}</p> : null}
          <h1 className="text-h1 text-balance">{title}</h1>
          {description ? <p className="max-w-2xl text-pretty text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
