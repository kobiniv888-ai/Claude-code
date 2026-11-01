import "server-only";
import { getTranslations } from "next-intl/server";
import { DatabaseIcon } from "lucide-react";
import { db } from "@/lib/db";

/**
 * Development only: a one-line strip when the database has no cities (the seed never ran or did
 * not finish — the site then looks empty). Renders nothing in production, without a query.
 */
export async function DemoDataBanner() {
  if (process.env.NODE_ENV !== "development") return null;
  let cities = 0;
  try {
    cities = await db.city.count();
  } catch {
    cities = 0;
  }
  if (cities > 0) return null;
  const t = await getTranslations("devNotices");
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-foreground"
    >
      <DatabaseIcon className="size-3.5 shrink-0 text-warning" aria-hidden />
      <span>
        {t.rich("demoDataMissing", {
          code: (chunks) => (
            <code dir="ltr" className="rounded bg-background/70 px-1 font-mono">
              {chunks}
            </code>
          ),
        })}
      </span>
    </p>
  );
}
