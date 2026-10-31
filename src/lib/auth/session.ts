import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { AccountType, Currency, Locale, UserRole, UserStatus } from "@/generated/prisma/enums";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { AppError, AuthRequiredError, ForbiddenError } from "@/lib/errors";
import { isAccountBlocked } from "./account-status";
import { safeNextPath, withNext } from "./next-path";
import { can, isStaffRole, type Permission } from "./permissions";
import { isPlaceholderEmail } from "./phone";
import { auth } from "./server";

/**
 * The signed-in user for Server Components, server actions and route handlers.
 * Everything is cached per request with React cache().
 */

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  /** True for phone-only accounts ("<digits>@phone.bayit.invalid"): never show or email it. */
  emailIsPlaceholder: boolean;
  image: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  role: UserRole;
  status: UserStatus;
  accountType: AccountType;
  businessName: string | null;
  locale: Locale;
  currency: Currency | null;
  timezone: string;
  keepsShabbat: boolean;
  showHebrewDates: boolean;
  twoFactorEnabled: boolean;
  idVerifiedAt: Date | null;
  isStaff: boolean;
  sessionId: string;
  /** True when 2-step login is off, or the code was entered in this session. */
  twoFactorVerified: boolean;
};

/** Better Auth session (cookie checked, expiry refreshed). Null when signed out. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const row = await db.session.findUnique({
    where: { id: session.session.id },
    select: {
      twoFactorVerifiedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phoneNumber: true,
          phoneNumberVerified: true,
          role: true,
          status: true,
          suspendedUntil: true,
          accountType: true,
          businessName: true,
          locale: true,
          currency: true,
          timezone: true,
          keepsShabbat: true,
          showHebrewDates: true,
          twoFactorEnabled: true,
          idVerifiedAt: true,
        },
      },
    },
  });
  if (!row) return null;
  const { user } = row;
  // Banned, deleted or currently suspended accounts are treated as signed out.
  if (isAccountBlocked(user)) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailIsPlaceholder: isPlaceholderEmail(user.email),
    image: user.image,
    phoneNumber: user.phoneNumber,
    phoneNumberVerified: !!user.phoneNumber && user.phoneNumberVerified === true,
    role: user.role,
    status: user.status,
    accountType: user.accountType,
    businessName: user.businessName,
    locale: user.locale,
    currency: user.currency,
    timezone: user.timezone,
    keepsShabbat: user.keepsShabbat,
    showHebrewDates: user.showHebrewDates,
    twoFactorEnabled: user.twoFactorEnabled,
    idVerifiedAt: user.idVerifiedAt,
    isStaff: isStaffRole(user.role),
    sessionId: session.session.id,
    twoFactorVerified: !user.twoFactorEnabled || row.twoFactorVerifiedAt !== null,
  };
});

/** Staff may skip 2-step login in local development only (DEV_SKIP_STAFF_2FA=true). */
export function isStaffTwoFactorSkipped(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_STAFF_2FA === "true";
}

// ── Page helpers (redirect) ──

/**
 * The path to come back to after login. Pages pass `next` explicitly; otherwise the
 * `x-pathname` request header is used when the proxy provides it.
 */
async function resolveNext(next: string | undefined, fallback?: string): Promise<string | undefined> {
  const candidate = next ?? (await headers()).get("x-pathname") ?? undefined;
  const safe = candidate ? safeNextPath(candidate, "") : "";
  return safe || fallback;
}

async function redirectWithNext(pathname: string, next: string | undefined): Promise<never> {
  const locale = await getLocale();
  return redirect({ href: withNext(pathname, next), locale });
}

/**
 * For pages that need a signed-in user. Redirects to /login, /two-factor or /verify-phone
 * (with ?next=) when needed, otherwise returns the user.
 *
 *   const user = await requireUser({ next: "/account/listings" });
 *   const owner = await requireUser({ phoneVerified: true, next: "/post" });
 */
export async function requireUser(
  opts: { phoneVerified?: boolean; next?: string } = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirectWithNext("/login", await resolveNext(opts.next));
  if (!user.twoFactorVerified) return redirectWithNext("/two-factor", await resolveNext(opts.next));
  if (opts.phoneVerified && !user.phoneNumberVerified) {
    return redirectWithNext("/verify-phone", await resolveNext(opts.next));
  }
  return user;
}

/**
 * For admin pages. Non-staff get a 404 (the admin panel does not reveal itself); staff must
 * have 2-step login enabled and verified in this session; a missing permission is a 404 too.
 */
export async function requireStaff(
  permission?: Permission,
  opts: { next?: string } = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirectWithNext("/login", await resolveNext(opts.next, "/admin"));
  if (!user.isStaff) notFound();
  if (!isStaffTwoFactorSkipped()) {
    if (!user.twoFactorEnabled) {
      return redirectWithNext("/two-factor/setup", await resolveNext(opts.next, "/admin"));
    }
    if (!user.twoFactorVerified) {
      return redirectWithNext("/two-factor", await resolveNext(opts.next, "/admin"));
    }
  } else if (user.twoFactorEnabled && !user.twoFactorVerified) {
    return redirectWithNext("/two-factor", await resolveNext(opts.next, "/admin"));
  }
  if (permission && !can(user.role, permission)) notFound();
  return user;
}

// ── Server action / route handler helpers (throw) ──

/** Thrown when an action needs a verified phone number (message key "errors.phone_not_verified"). */
export class PhoneNotVerifiedError extends AppError {
  constructor() {
    super("phone_not_verified", "A verified phone number is required", { status: 403 });
  }
}

/**
 * Like requireUser, but throws AuthRequiredError / PhoneNotVerifiedError instead of
 * redirecting — use inside server actions together with toActionError().
 */
export async function requireUserForAction(
  opts: { phoneVerified?: boolean } = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthRequiredError();
  if (!user.twoFactorVerified) throw new AuthRequiredError("2-step login required");
  if (opts.phoneVerified && !user.phoneNumberVerified) throw new PhoneNotVerifiedError();
  return user;
}

/** Like requireStaff, but throws (ForbiddenError) — for admin server actions. */
export async function requireStaffForAction(permission: Permission): Promise<CurrentUser> {
  const user = await requireUserForAction();
  if (!user.isStaff) throw new ForbiddenError();
  if (!isStaffTwoFactorSkipped() && !user.twoFactorEnabled) {
    throw new ForbiddenError("2-step login must be enabled for staff");
  }
  if (!can(user.role, permission)) throw new ForbiddenError();
  return user;
}
