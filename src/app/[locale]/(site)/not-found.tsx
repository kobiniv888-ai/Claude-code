import { NotFoundView } from "@/components/layout/not-found-view";

/**
 * The designed 404 page of the public site (any notFound() of a public page, and unknown
 * one-word addresses such as /he/does-not-exist, which reach the city page), inside the (site)
 * layout's header and footer. Deeper unknown addresses get the same page through ../[...rest].
 */
export default function SiteNotFound() {
  return <NotFoundView />;
}
