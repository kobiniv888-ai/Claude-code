import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
// The dev pages show components from every section; their utilities are not all in the public stylesheet.
import "../../sections.css";

/** /dev/** — design-system and test pages (hidden in production): every stylesheet and all interface text. */
export default function DevLayout({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
