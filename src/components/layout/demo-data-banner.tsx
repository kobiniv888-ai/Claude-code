import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { DemoBannerDismiss } from "./demo-banner-dismiss";
import { DISMISSED_ALERTS_ATTR } from "./dismissed-alerts";

/** Stored in the dismissed-alerts list when a visitor closes the demo bar. */
const DEMO_BANNER_KEY = "demo-data";

/**
 * A slim notice while demo listings are visible (Admin → Settings → "Demo data"): listings marked
 * "Demo" are examples. Visitors can close it; the choice is remembered on this device
 * (localStorage, like the scam alerts) and the bar is hidden before paint on the next visit.
 */
export async function DemoDataBanner() {
  const [t, tc] = await Promise.all([getTranslations("banners.demo"), getTranslations("common")]);
  return (
    <div data-demo-banner className="border-b border-border bg-surface-muted text-foreground">
      <style>{`html[${DISMISSED_ALERTS_ATTR}~="${DEMO_BANNER_KEY}"] [data-demo-banner]{display:none}`}</style>
      <Container className="flex min-h-9 items-center justify-center gap-2 py-1 pe-0 text-caption leading-snug sm:pe-2 lg:pe-4">
        <span className="inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 font-medium text-muted-foreground">
          <FlaskConical aria-hidden className="size-3" />
          {tc("demo")}
        </span>
        <p className="min-w-0 text-pretty">{t("text")}</p>
        <DemoBannerDismiss alertKey={DEMO_BANNER_KEY} label={t("dismiss")} />
      </Container>
    </div>
  );
}
