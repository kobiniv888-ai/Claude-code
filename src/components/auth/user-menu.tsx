import { formatPhoneInternational } from "@/lib/auth/phone";
import type { CurrentUser } from "@/lib/auth/session";
import { LoginButton } from "./login-dialog";
import { UserMenuClient, type UserMenuUser } from "./user-menu-client";

/**
 * Header account menu. Safe to render from a Server Component: pass the user from
 * `getCurrentUser()` (null shows the "Log in" button). Only the fields the menu needs are
 * sent to the browser.
 *
 *   <UserMenu user={await getCurrentUser()} />
 */
export function UserMenu({ user, className }: { user: CurrentUser | null; className?: string }) {
  if (!user) return <LoginButton className={className} />;

  const contact = user.emailIsPlaceholder ? user.phoneNumber : user.email;
  // Phone-only accounts are named after their number until they set a name: don't repeat it.
  const nameDigits = user.name.replace(/\D/g, "");
  const sameAsName = !!contact && nameDigits.length >= 7 && contact.replace(/\D/g, "") === nameDigits;
  const menuUser: UserMenuUser = {
    name: user.name,
    image: user.image,
    // Formatted here so the browser does not need the phone-number metadata (~50 KB) on every page.
    contact: sameAsName || !contact ? null : user.emailIsPlaceholder ? formatPhoneInternational(contact) : contact,
    contactIsPhone: user.emailIsPlaceholder,
    isStaff: user.isStaff,
  };
  return (
    <div className={className}>
      <UserMenuClient user={menuUser} />
    </div>
  );
}
