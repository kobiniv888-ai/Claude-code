import { ArchiveIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { contentTags } from "@/components/content/rich";
import { retentionFacts } from "@/lib/legal/retention-facts";

const ITEMS = ["a", "b", "c", "d", "e", "f"] as const;

/**
 * "What we keep, and for how long" above "Delete my account" (SECURITY_REPORT 15.8.b): the records
 * that stay after a deletion, with the times the cleanup jobs really use (src/lib/legal/retention-facts.ts).
 */
export async function DeletionKeeps() {
  const t = await getTranslations("account.settings.delete");
  const values = { ...retentionFacts(), ...contentTags };
  return (
    <section aria-labelledby="deletion-keeps-title" className="grid gap-2 rounded-xl border border-border bg-surface-muted p-3.5 text-sm">
      <h3 id="deletion-keeps-title" className="flex items-center gap-2 font-semibold">
        <ArchiveIcon aria-hidden className="size-4 shrink-0 text-primary-text" />
        {t("keptTitle")}
      </h3>
      <ul className="grid list-disc gap-1 ps-5 text-muted-foreground">
        {ITEMS.map((item) => (
          <li key={item}>{t.rich(`kept.${item}`, values)}</li>
        ))}
      </ul>
      <p className="text-muted-foreground">{t.rich("keptMore", values)}</p>
    </section>
  );
}
