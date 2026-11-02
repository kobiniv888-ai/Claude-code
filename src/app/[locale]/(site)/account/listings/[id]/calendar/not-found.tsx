import { useTranslations } from "next-intl";
import { CalendarX2Icon } from "lucide-react";
import { NotFoundState } from "@/components/common/states";

export default function ListingCalendarNotFound() {
  const t = useTranslations("hostBooking.calendar.notFound");
  return (
    <div className="py-10">
      <NotFoundState bordered icon={CalendarX2Icon} title={t("title")} description={t("body")} action={{ label: t("back"), href: "/account/listings" }} />
    </div>
  );
}
