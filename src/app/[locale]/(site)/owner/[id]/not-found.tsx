import { useTranslations } from "next-intl";
import { SearchIcon, UserRoundXIcon } from "lucide-react";
import { Container } from "@/components/common/container";
import { NotFoundState } from "@/components/common/states";

/** An owner profile that does not exist, or a deleted or banned account. */
export default function OwnerNotFound() {
  const t = useTranslations("owner.notFound");
  return (
    <Container>
      <NotFoundState
        icon={UserRoundXIcon}
        headingLevel="h1"
        size="lg"
        title={t("title")}
        description={t("description")}
        action={{ label: t("search"), href: "/search", icon: SearchIcon }}
        secondaryAction={{ label: t("home"), href: "/" }}
      />
    </Container>
  );
}
