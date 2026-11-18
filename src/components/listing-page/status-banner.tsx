import { useTranslations } from "next-intl";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Container } from "@/components/common/container";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { PreviewReason } from "@/lib/listing-page/access";

/** Shown to the owner or staff when they open a listing that is not public. */
export function StatusBanner({ reason, isOwner }: { reason: PreviewReason; isOwner: boolean }) {
  const t = useTranslations("listing.status");
  return (
    <div className="border-b border-border-strong/30 bg-surface-muted" role="status">
      <Container className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <SpriteIcon name="eye-off" className="mt-0.5 size-5 shrink-0 text-foreground" />
          <div className="grid gap-0.5">
            <p className="font-semibold text-foreground">{t("title", { status: t(`labels.${reason}`) })}</p>
            <p className="text-sm text-foreground/80">{t(`text.${reason}`)}</p>
          </div>
        </div>
        {isOwner ? (
          <Button asChild variant="outline" className="h-10 shrink-0 rounded-button bg-card">
            <Link href="/account/listings">{t("manage")}</Link>
          </Button>
        ) : (
          <p className="shrink-0 text-xs text-muted-foreground">{t("staffNote")}</p>
        )}
      </Container>
    </div>
  );
}
