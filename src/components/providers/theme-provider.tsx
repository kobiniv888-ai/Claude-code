"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

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
      disableTransitionOnChange
      nonce={nonce}
      scriptProps={scriptProps}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
