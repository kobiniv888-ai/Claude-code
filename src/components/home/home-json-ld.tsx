import { headers } from "next/headers";
import { JsonLd } from "@/components/common/json-ld";
import type { AppLocale } from "@/config/site";
import { homeJsonLd } from "@/lib/seo";

/**
 * The home page's WebSite and Organization structured data (round 3, brief 10: only types Google
 * supports). No SearchAction: Google retired the search box it powered in November 2024.
 */
export async function HomeJsonLd({ locale }: { locale: AppLocale }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <JsonLd nonce={nonce} data={homeJsonLd(locale)} />;
}
