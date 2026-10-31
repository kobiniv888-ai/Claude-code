import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

/** /post/** — the listing wizard. Its client components need the `wizard` messages, which the site root does not send. */
export default function PostLayout({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
