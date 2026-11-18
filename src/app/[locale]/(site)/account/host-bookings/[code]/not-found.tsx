import { useTranslations } from "next-intl";
import { CalendarSearchIcon } from "lucide-react";
import { NotFoundState } from "@/components/common/states";
import { HOST_BOOKINGS_PATH } from "@/lib/booking/constants";

export default function HostBookingNotFound() {
  const t = useTranslations("hostBooking.details.notFound");
  return (
    <div className="py-10">
      <NotFoundState bordered icon={CalendarSearchIcon} title={t("title")} description={t("body")} action={{ label: t("back"), href: HOST_BOOKINGS_PATH }} />
    </div>
  );
}
