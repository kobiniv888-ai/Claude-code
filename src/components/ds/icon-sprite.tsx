import "server-only";
import { SPRITE_SYMBOLS } from "./sprite-symbols.generated";

/**
 * The sprite icons' symbols (scripts/generate-icon-sprite.mjs), hidden at the start of each page:
 * <SpriteIcon> draws `<use href="#bi-…">` from them. Before, they came from public/icons/sprite-….svg,
 * one more request before the first paint that waited behind the stylesheets (and the icons of the
 * first screen appeared when it arrived). Rendered once by the root layout, before any icon.
 */
export function IconSprite() {
  return <svg aria-hidden="true" focusable="false" style={{ display: "none" }} dangerouslySetInnerHTML={{ __html: SPRITE_SYMBOLS }} />;
}
