import { HeartHandshake } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/format";
import { getPledgeStatus } from "@/lib/pledge/server";

/** Admin user page: one line with the accepted pledge version and date (an <li>). */
export async function PledgeAdminFact({ userId, locale }: { userId: string; locale: string }) {
  const [status, t] = await Promise.all([getPledgeStatus(userId), getTranslations("pledge.admin")]);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <HeartHandshake aria-hidden className={status.badgeValid ? "size-4 text-success" : "size-4 text-muted-foreground"} />
      <span className="font-medium">{t("title")}:</span>
      {status.version === null ? (
        <span>{t("notAccepted")}</span>
      ) : (
        <>
          <span>
            {t("acceptedVersion", { version: status.version })}
            {status.acceptedAt ? ` ${t("acceptedAt", { date: formatDate(status.acceptedAt, locale) })}` : ""}
          </span>
          <span className="text-muted-foreground">
            ({status.isCurrent ? t("current") : t("outdated", { current: status.currentVersion })})
          </span>
        </>
      )}
    </li>
  );
}
