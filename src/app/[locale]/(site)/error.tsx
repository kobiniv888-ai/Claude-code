"use client";

import { ErrorView } from "@/components/layout/error-view";

/** Errors in a page: shown inside the site frame, so the header and footer stay usable. */
export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
