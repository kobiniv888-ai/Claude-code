import { headers } from "next/headers";
import { JsonLd } from "@/components/common/json-ld";
import type { AppLocale } from "@/config/site";
import { breadcrumbJsonLd } from "@/lib/seo";
import type { CityCrumb } from "./city-page-header";

/** BreadcrumbList structured data of a city page (the same trail as the visible breadcrumbs). */
export async function CityBreadcrumbJsonLd({ crumbs, locale }: { crumbs: CityCrumb[]; locale: AppLocale }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <JsonLd nonce={nonce} data={breadcrumbJsonLd(crumbs, locale)} />;
}
