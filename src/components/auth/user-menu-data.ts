import { formatPhoneInternational } from "@/lib/auth/phone";
import type { CurrentUser } from "@/lib/auth/session";
import type { UserMenuUser } from "./user-menu-client";

// Its own module, without the menu's client component, so the header can pass this to a lazily
// loaded menu without the menu's code joining every page's first load.
/** What <UserMenuClient> needs about the user (null when signed out). Server-side only. */
export function userMenuData(user: CurrentUser | null): UserMenuUser | null {
  if (!user) return null;
  const contact = user.emailIsPlaceholder ? user.phoneNumber : user.email;
  // Phone-only accounts are named after their number until they set a name: don't repeat it.
  const nameDigits = user.name.replace(/\D/g, "");
  const sameAsName = !!contact && nameDigits.length >= 7 && contact.replace(/\D/g, "") === nameDigits;
  return {
    name: user.name,
    image: user.image,
    // Formatted here so the browser does not need the phone-number metadata (~50 KB) on every page.
    contact: sameAsName || !contact ? null : user.emailIsPlaceholder ? formatPhoneInternational(contact) : contact,
    contactIsPhone: user.emailIsPlaceholder,
    isStaff: user.isStaff,
  };
}
