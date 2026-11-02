import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminMobileNav, AdminSidebar, SignOutButton, ViewSiteLink } from "@/components/admin/admin-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { adminNavFor } from "@/lib/admin/nav";
import { getAdminCounts } from "@/lib/admin/server/counts";
import { requireStaff } from "@/lib/auth/session";
// The admin panel's utilities are not in the public stylesheet (src/app/globals.css).
import "../../sections.css";

export async function generateMetadata({ params }: LayoutProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.meta" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

/**
 * The admin panel: its own app-like layout (no public header/footer). Staff only, with 2-step
 * login (requireStaff); every page checks its own permission again.
 */
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff();
  const [t, counts] = await Promise.all([getTranslations("admin"), getAdminCounts().catch(() => null)]);
  const items = adminNavFor(staff.role);

  return (
    // All interface text for the admin client components (the site root only sends public namespaces).
    <NextIntlClientProvider>
      <div className="min-h-dvh bg-muted/40 lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <aside className="hidden border-e bg-sidebar text-sidebar-foreground lg:block">
          <div className="sticky top-0 h-dvh">
            <AdminSidebar items={items} counts={counts} />
          </div>
        </aside>
        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
            <AdminMobileNav items={items} counts={counts} />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium" dir="auto">
                {staff.name}
              </span>
              <span className="hidden shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary min-[400px]:inline">
                {t(`roles.${staff.role}`)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <LanguageSwitcher align="end" />
              <ViewSiteLink />
              <SignOutButton />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 outline-none sm:px-6 lg:px-8 lg:py-7">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
