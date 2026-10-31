import { headers } from "next/headers";
import { JsonLd } from "@/components/common/json-ld";
import type { AppLocale } from "@/config/site";
import { absoluteUrl, localizedPath, siteName } from "@/lib/seo";

/** WebSite structured data with a SearchAction (the search box in search results). */
export async function HomeJsonLd({ locale }: { locale: AppLocale }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <JsonLd
      nonce={nonce}
      data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteName(locale),
        url: absoluteUrl(localizedPath(locale, "/")),
        inLanguage: locale,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${absoluteUrl(localizedPath(locale, "/search"))}?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      }}
    />
  );
}
