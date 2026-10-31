"use client";

/**
 * A tiny inline script that must run before the page paints (theme, remembered notices).
 * It runs from the server-rendered HTML. If React ever creates the element in the browser
 * (e.g. when a not-found or error page re-renders the layout), it is marked as a data block:
 * browsers never run scripts inserted that way, and React would otherwise warn about it.
 */
const type = typeof window === "undefined" ? undefined : "application/json";

export function InlineScript({ html, nonce, id }: { html: string; nonce?: string; id?: string }) {
  return (
    <script
      id={id}
      type={type}
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
