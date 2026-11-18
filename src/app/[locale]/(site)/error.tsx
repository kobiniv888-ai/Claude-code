"use client";

// Errors in a page: shown inside the site frame, so the header and footer stay usable. The error
// page's code loads only when needed (src/components/layout/error-boundaries.tsx).
export { SiteError as default } from "@/components/layout/error-boundaries";
