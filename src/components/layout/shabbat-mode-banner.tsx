import { Sunset } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { siteConfig } from "@/config/site";
import { formatDate } from "@/lib/format";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { isShabbatModeActive } from "@/lib/settings";

/**
 * "Shabbat Shalom" bar while Shabbat mode is on (admin setting) and it is Shabbat or a holiday
 * in Israel: posting, messages and support are paused until Havdalah (Israel time).
 */
export async function ShabbatModeBanner() {
  const status = await isShabbatModeActive();
  if (!status.active || !status.endsAt) return null;

  const [locale, t] = await Promise.all([getLocale(), getTranslations("banners.shabbat")]);
  const { kind } = isShabbatOrHolidayNow(siteConfig.shabbat.israel);
  const time = formatDate(status.endsAt, locale, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: siteConfig.shabbat.israel.timezone,
  });

  return (
    <div role="status" className="relative overflow-hidden bg-primary text-primary-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-0 w-1/3 bg-linear-to-r from-primary/25 to-transparent rtl:bg-linear-to-l"
      />
      <Container className="relative flex items-start justify-center gap-3 py-2.5 text-sm sm:items-center">
        <Sunset aria-hidden className="mt-0.5 size-[18px] shrink-0 opacity-90 sm:mt-0" />
        <p className="text-pretty">
          <strong className="font-semibold">{kind === "holiday" ? t("titleHoliday") : t("title")}</strong>
          <span aria-hidden className="mx-2 opacity-60">
            ·
          </span>
          {t("text", { time })}
        </p>
      </Container>
    </div>
  );
}
