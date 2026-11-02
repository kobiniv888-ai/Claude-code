"use client";

import { CurrencySwitcher } from "./currency-switcher";
import { LanguageSwitcher } from "./language-switcher";

/** The footer's language and currency pickers (loaded by ./footer-pickers). */
export function FooterPickers() {
  return (
    <>
      <LanguageSwitcher variant="footer" align="end" />
      <CurrencySwitcher variant="footer" align="end" />
    </>
  );
}
