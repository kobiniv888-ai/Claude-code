import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { NotFoundState } from "@/components/common/states";
import { LifeBuoy } from "lucide-react";

export default function TicketNotFound() {
  const t = useTranslations("tickets.notFound");
  return (
    <Container size="narrow" className="py-10">
      <NotFoundState
        bordered
        icon={LifeBuoy}
        title={t("title")}
        description={t("body")}
        action={{ label: t("myTickets"), href: "/account/tickets" }}
        secondaryAction={{ label: t("help"), href: "/help" }}
      />
    </Container>
  );
}
