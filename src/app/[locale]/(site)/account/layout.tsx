import type { ReactNode } from "react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { AccountShell } from "@/components/account/account-shell";
import { accountNavItems } from "@/lib/account/nav";
import { requireUser } from "@/lib/auth/session";
import { BOOKABLE_DEAL_TYPES } from "@/lib/booking/constants";
import { db } from "@/lib/db";
// The dashboard's utilities are not in the public stylesheet (src/app/globals.css).
import "../../../sections.css";

/** Private pages: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** /account/** — the signed-in user's dashboard (side navigation on desktop, tabs on phones). */
export default async function AccountLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [waitingTickets, bookablePlace, hostBooking] = await Promise.all([
    db.ticket.count({ where: { userId: user.id, status: "WAITING_FOR_USER" } }),
    // "הזמנות לנכסים שלי" is for hosts: a short stay or hotel of theirs, or bookings of their places.
    db.listing.findFirst({
      where: { ownerId: user.id, dealType: { in: [...BOOKABLE_DEAL_TYPES] }, deletedAt: null, status: { not: "DELETED" } },
      select: { id: true },
    }),
    db.booking.findFirst({ where: { hostUserId: user.id }, select: { id: true } }),
  ]);

  return (
    // All interface text for the dashboard's client components (the site root only sends public namespaces).
    <NextIntlClientProvider>
      <AccountShell items={accountNavItems(undefined, { host: bookablePlace !== null || hostBooking !== null })} user={{ name: user.name, image: user.image }} waitingTickets={waitingTickets}>
        {children}
      </AccountShell>
    </NextIntlClientProvider>
  );
}
