"use client";

import { use, useLayoutEffect, useRef } from "react";

/**
 * The sprite icons' symbols (scripts/generate-icon-sprite.mjs), hidden at the start of each page:
 * <SpriteIcon> draws `<use href="#bi-…">` from them. Before, they came from public/icons/sprite-….svg,
 * one more request before the first paint that waited behind the stylesheets (and the icons of the
 * first screen appeared when it arrived). Rendered once by the root layout, before any icon.
 *
 * The symbols are written into the HTML only (server rendering). The page's RSC data and scripts
 * don't carry them: hydration keeps the server's content. If the browser ever creates this element
 * itself (a fresh render of the root layout), it fetches them then.
 */
const serverSymbols: Promise<string> | null =
  typeof window === "undefined" ? import("./sprite-symbols.generated").then((module) => module.SPRITE_SYMBOLS) : null;

export function IconSprite() {
  const html = serverSymbols ? use(serverSymbols) : "";
  const sprite = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const svg = sprite.current;
    if (!svg || svg.firstChild) return;
    void import("./sprite-symbols.generated").then((module) => {
      if (!svg.firstChild) svg.innerHTML = module.SPRITE_SYMBOLS;
    });
  }, []);
  return (
    <svg
      ref={sprite}
      aria-hidden="true"
      focusable="false"
      style={{ display: "none" }}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
