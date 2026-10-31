import { getTranslations } from "next-intl/server";
import { MoonStarIcon } from "lucide-react";
import { StateView } from "@/components/common/states";
import type { AppLocale } from "@/config/site";
import { formatDate, formatTime } from "@/lib/format";

/** Posting pauses in Shabbat mode (admin setting): a friendly "Shabbat Shalom" state. */
export async function ShabbatPaused({ locale, endsAt }: { locale: AppLocale; endsAt: Date | null }) {
  const t = await getTranslations("wizard.shabbat");
  return (
    <StateView
      icon={MoonStarIcon}
      tone="primary"
      size="lg"
      headingLevel="h1"
      title={t("title")}
      description={t("description")}
      action={{ label: t("browse"), href: "/" }}
    >
      {endsAt && (
        <p className="text-sm text-muted-foreground">
          {t("endsAt", {
            time: `${formatDate(endsAt, locale, { weekday: "long", day: "numeric", month: "long" })} ${formatTime(endsAt, locale)}`,
          })}
        </p>
      )}
    </StateView>
  );
}
