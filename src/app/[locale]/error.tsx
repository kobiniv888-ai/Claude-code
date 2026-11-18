"use client";

// Errors in the site layout itself (header, banners): a self-contained page with a way back. The
// error page's code loads only when needed (src/components/layout/error-boundaries.tsx).
export { LocaleError as default } from "@/components/layout/error-boundaries";
