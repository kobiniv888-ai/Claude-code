import { getTranslations } from "next-intl/server";
import { Ltr } from "@/components/common/ltr";
import { cn } from "@/lib/utils";
import { siteCookies } from "./legal-docs";

// Every cookie is essential (src/lib/legal/cookies.ts); optional storage is not a cookie.
const categoryStyle = {
  necessary: "bg-primary/10 text-primary",
} as const;

/** The cookies we set, as a list of cards (readable at 360px, a grid on wider screens). */
export async function CookieTable({ locale, base }: { locale: string; base: string }) {
  const t = await getTranslations({ locale, namespace: "legal" });
  return (
    <ul className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {siteCookies.map((cookie) => (
        <li key={cookie.id} className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-semibold text-foreground">
              <Ltr>{cookie.name}</Ltr>
            </code>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                categoryStyle[cookie.category],
              )}
            >
              {t(`${base}.categories.${cookie.category}`)}
            </span>
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-medium text-foreground">{t(`${base}.purpose`)}</dt>
              <dd className="text-muted-foreground">{t(`${base}.rows.${cookie.id}.purpose`)}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">{t(`${base}.duration`)}</dt>
              <dd className="text-muted-foreground">{t(`${base}.rows.${cookie.id}.duration`)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
