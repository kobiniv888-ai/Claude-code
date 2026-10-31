import type { ReactNode } from "react";
import { HouseIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Centered card for the login, phone and 2-step pages. Looks complete on its own and inside
 * the site layout (header/footer).
 */
export function AuthShell({
  locale,
  title,
  description,
  icon,
  children,
  footer,
  className,
}: {
  locale: AppLocale;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
  return (
    <div className="relative isolate flex w-full justify-center px-4 py-8 sm:py-14">
      {/* Soft brand glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]"
      />
      <div className={cn("flex w-full max-w-[26rem] flex-col gap-6", className)}>
        <Link
          href="/"
          className="mx-auto flex items-center gap-2 rounded-lg px-2 py-1 text-xl font-bold tracking-tight text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <HouseIcon className="size-5" aria-hidden />
          </span>
          <span>{brand}</span>
        </Link>

        <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/5 sm:p-8">
          <div className="mb-6 grid gap-2 text-center">
            {icon && <div className="mx-auto mb-1">{icon}</div>}
            <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
            {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>

        {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

/** Loading state for the auth pages (skeleton card). */
export function AuthShellSkeleton() {
  return (
    <div className="flex w-full justify-center px-4 py-8 sm:py-14" aria-busy>
      <div className="flex w-full max-w-[26rem] flex-col gap-6">
        <Skeleton className="mx-auto h-9 w-28 rounded-xl" />
        <div className="grid gap-4 rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/5 sm:p-8">
          <Skeleton className="mx-auto h-7 w-3/4 rounded-lg" />
          <Skeleton className="mx-auto h-4 w-5/6" />
          <Skeleton className="mt-2 h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
