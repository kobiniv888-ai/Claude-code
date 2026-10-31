"use client";

import { useCallback, type ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

/**
 * Light / dark / device theme (class "dark" on <html>). The layout passes the CSP nonce so the
 * tiny "apply the saved theme before paint" script is allowed.
 *
 * The script only needs to run in the server-rendered HTML. If React ever creates it in the
 * browser (it never runs there anyway), marking it as a data block keeps React from warning.
 */
const scriptProps = { type: typeof window === "undefined" ? "text/javascript" : "application/json" };

export function ThemeProvider({ nonce, children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Not `disableTransitionOnChange`: next-themes also applies the theme on every page load, and
      // that option adds and removes a global style each time (two full style recalculations, plus
      // more for the device setting). useSetTheme() below turns transitions off for real changes only.
      nonce={nonce}
      scriptProps={scriptProps}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

/**
 * `setTheme` from next-themes, with CSS transitions switched off while the colors change, so the
 * page switches at once instead of animating every border and background.
 */
export function useSetTheme() {
  const { setTheme } = useTheme();
  return useCallback(
    (theme: string) => {
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{transition:none!important}";
      document.head.appendChild(style);
      setTheme(theme);
      // next-themes applies the class in an effect: wait for it, then for the restyle.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          void window.getComputedStyle(document.body).opacity;
          style.remove();
        }),
      );
    },
    [setTheme],
  );
}
