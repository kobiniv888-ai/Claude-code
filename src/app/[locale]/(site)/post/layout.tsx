import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
// The wizard's utilities are not in the public stylesheet (src/app/globals.css).
import "../../../sections.css";

/** /post/** — the listing wizard. Its client components need the `wizard` messages, which the site root does not send. */
export default function PostLayout({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
