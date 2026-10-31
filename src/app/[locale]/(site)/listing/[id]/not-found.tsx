import { useTranslations } from "next-intl";
import { HouseIcon, SearchIcon } from "lucide-react";
import { Container } from "@/components/common/container";
import { NotFoundState } from "@/components/common/states";

/** A listing that does not exist, was removed, or is not public. */
export default function ListingNotFound() {
  const t = useTranslations("listing.notFound");
  return (
    <Container>
      <NotFoundState
        icon={HouseIcon}
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
