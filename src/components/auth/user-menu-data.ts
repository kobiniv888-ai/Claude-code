import { personName } from "@/lib/auth/first-name";
import { formatPhoneInternational } from "@/lib/auth/phone";
import type { CurrentUser } from "@/lib/auth/session";
import type { UserMenuUser } from "./user-menu-client";

// Its own module, without the menu's client component, so the header can pass this to a lazily
// loaded menu without the menu's code joining every page's first load.
/** What <UserMenuClient> needs about the user (null when signed out). Server-side only. */
export function userMenuData(user: CurrentUser | null): UserMenuUser | null {
  if (!user) return null;
  const contact = user.emailIsPlaceholder ? user.phoneNumber : user.email;
  return {
    // Never a phone number or an email as a name (bug 8.2): empty shows "My account" and a person icon.
    name: personName(user) ?? "",
    image: user.image,
    // Formatted here so the browser does not need the phone-number metadata (~50 KB) on every page.
    contact: !contact ? null : user.emailIsPlaceholder ? formatPhoneInternational(contact) : contact,
    contactIsPhone: user.emailIsPlaceholder,
    isStaff: user.isStaff,
  };
}
