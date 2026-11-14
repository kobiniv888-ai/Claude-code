import { getLocale } from "next-intl/server";
import { BrandLockup } from "@/components/brand/mark";
import { NotFoundView } from "@/components/layout/not-found-view";
import { Link } from "@/i18n/navigation";

/**
 * 404 for the addresses of a language that are outside the public site (admin and dev pages).
 * Public pages and unknown addresses get the same content inside the site's header and footer:
 * app/[locale]/(site)/not-found.tsx and app/[locale]/[...rest]/not-found.tsx.
 *
 * Deliberately without the site frame: this page is rendered into the data of every page of the
 * language (Next.js does that for a segment's not-found page), so the frame would be sent twice
 * with each page.
 */
export default async function NotFound() {
  const locale = await getLocale();
  return (
    <main id="main" tabIndex={-1} className="flex min-h-dvh flex-col items-center justify-center gap-6 py-10 outline-none">
      <Link href="/" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <BrandLockup locale={locale} size={26} />
      </Link>
      <NotFoundView />
    </main>
  );
}
