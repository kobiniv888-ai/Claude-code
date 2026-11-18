import type { CurrentUser } from "@/lib/auth/session";
import { LoginButton } from "./login-dialog";
import { userMenuData } from "./user-menu-data";
import { UserMenuClient } from "./user-menu-client";

/**
 * Header account menu. Safe to render from a Server Component: pass the user from
 * `getCurrentUser()` (null shows the "Log in" button). Only the fields the menu needs are
 * sent to the browser.
 *
 *   <UserMenu user={await getCurrentUser()} />
 */
export function UserMenu({ user, className }: { user: CurrentUser | null; className?: string }) {
  const menuUser = userMenuData(user);
  if (!menuUser) return <LoginButton className={className} />;
  return (
    <div className={className}>
      <UserMenuClient user={menuUser} />
    </div>
  );
}
