import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function Loading() {
  const t = useTranslations("wizard.chrome");
  return (
    <Container size="narrow" className="grid gap-8 py-8 sm:py-12" role="status">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3">
        <SkeletonBlock className="h-9 w-2/3" />
        <SkeletonBlock className="h-5 w-full max-w-md" />
      </div>
      <SkeletonBlock className="h-72 rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock className="h-28 rounded-2xl" />
        <SkeletonBlock className="h-28 rounded-2xl" />
      </div>
    </Container>
  );
}
