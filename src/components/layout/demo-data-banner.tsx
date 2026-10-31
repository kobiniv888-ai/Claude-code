import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";

/** Thin preview notice while demo listings are visible (Admin → Settings → "Demo data"). */
export async function DemoDataBanner() {
  const [t, tc] = await Promise.all([getTranslations("banners.demo"), getTranslations("common")]);
  return (
    <div className="border-b bg-muted/70 text-muted-foreground">
      <Container className="py-1.5 text-center text-xs leading-snug text-pretty">
        <span className="me-2 inline-flex translate-y-px items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 align-baseline font-semibold text-warning ring-1 ring-warning/25">
          <FlaskConical aria-hidden className="size-3" />
          {tc("demo")}
        </span>
        {t("text")}
      </Container>
    </div>
  );
}
