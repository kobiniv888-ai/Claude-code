import { Ltr } from "@/components/common/ltr";
import type { StaffPhone } from "@/lib/admin/staff-visibility";

/**
 * A phone number on an admin page, as the viewer may see it (Q12, founder's answer (c)): the
 * number for an ADMIN; for other staff only the last 2 digits ("••• ••• ••45") and a note that
 * the number is for an admin only. The full number never reaches them: the query leaves it out.
 */
export function StaffPhoneValue({
  phone,
  withheldNote,
  empty = "—",
  className,
}: {
  phone: StaffPhone;
  /** e.g. t("users.phoneLast2Only"). */
  withheldNote: string;
  empty?: string;
  className?: string;
}) {
  if (phone.phoneNumber) return <Ltr className={className}>{phone.phoneNumber}</Ltr>;
  if (!phone.phoneWithheld) return <>{empty}</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {phone.phoneMasked ? <Ltr className={className}>{phone.phoneMasked}</Ltr> : null}
      <span className="text-xs text-muted-foreground">{withheldNote}</span>
    </span>
  );
}
