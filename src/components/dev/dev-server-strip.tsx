import "server-only";
import { getTranslations } from "next-intl/server";
import { SnailIcon } from "lucide-react";

/**
 * Development server only (`next dev`): a slim strip on every page, "גרסת פיתוח (איטית). לגרסה
 * המהירה: bash .devcontainer/start-prod.sh" (round 3: the founder kept testing on the slow
 * development server by mistake). Never in production (`next start`), not even in test mode.
 */
export async function DevServerStrip() {
  if (process.env.NODE_ENV !== "development") return null;
  const t = await getTranslations("devNotices");
  return (
    <p
      role="note"
      className="flex items-center justify-center gap-2 border-b border-dashed border-border-strong/60 bg-surface-muted px-4 py-1 text-center text-xs font-medium text-foreground"
    >
      <SnailIcon className="size-3.5 shrink-0" aria-hidden />
      <span>
        {t.rich("devServer", {
          code: (chunks) => (
            <code dir="ltr" className="inline-block rounded bg-background/70 px-1 font-mono whitespace-nowrap">
              {chunks}
            </code>
          ),
        })}
      </span>
    </p>
  );
}
