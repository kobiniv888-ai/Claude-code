import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function Loading() {
  const t = useTranslations("wizard.chrome");
  return (
    <Container size="narrow" className="grid gap-8 py-6 sm:py-12" role="status">
      <span className="sr-only">{t("loading")}</span>
      {/* The start card: photo, title, the big start button. */}
      <div className="overflow-hidden rounded-card bg-card shadow-card ring-1 ring-foreground/5">
        <SkeletonBlock className="aspect-[16/9] rounded-none sm:aspect-[21/9]" />
        <div className="grid gap-4 p-5 sm:p-8">
          <SkeletonBlock className="h-9 w-2/3" />
          <SkeletonBlock className="h-5 w-full max-w-md" />
          <SkeletonBlock className="h-13 w-full rounded-full sm:w-56" />
        </div>
      </div>
    </Container>
  );
}
