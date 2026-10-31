import { useTranslations } from "next-intl";
import { SearchXIcon } from "lucide-react";
import { NotFoundState } from "@/components/common/states";

export default function ListingStatsNotFound() {
  const t = useTranslations("account.stats.notFound");
  return (
    <div className="py-10">
      <NotFoundState bordered icon={SearchXIcon} title={t("title")} description={t("body")} action={{ label: t("back"), href: "/account/listings" }} />
    </div>
  );
}
