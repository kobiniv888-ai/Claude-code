import type { ReactNode } from "react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { AccountShell } from "@/components/account/account-shell";
import { accountNavItems } from "@/lib/account/nav";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

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
  const waitingTickets = await db.ticket.count({ where: { userId: user.id, status: "WAITING_FOR_USER" } });

  return (
    // All interface text for the dashboard's client components (the site root only sends public namespaces).
    <NextIntlClientProvider>
      <AccountShell items={accountNavItems()} user={{ name: user.name, image: user.image }} waitingTickets={waitingTickets}>
        {children}
      </AccountShell>
    </NextIntlClientProvider>
  );
}
