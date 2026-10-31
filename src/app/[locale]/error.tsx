"use client";

import { ErrorView } from "@/components/layout/error-view";

/** Errors in the site layout itself (header, banners): a self-contained page with a way back. */
export default function LocaleError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} standalone />;
}
