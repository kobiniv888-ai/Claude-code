import { createCn } from "cn/config";

/**
 * Class-name merger. Our design tokens (src/app/styles/bayit.css) are registered, so later
 * classes override them as expected: the type scale (text-display … text-caption, text-price)
 * as font sizes — cn("text-h1 text-white") keeps both instead of treating text-h1 as a colour —
 * the radii (rounded-card/input/button/sheet) and the spacing names (px-gutter, py-section,
 * p-card, h-button, h-button-sm, h-chip, h-tag, size-tap…), so cn("h-button", "h-auto") → "h-auto".
 */
export const cn = createCn({
  extend: {
    theme: {
      radius: ["card", "input", "button", "sheet"],
      spacing: ["gutter", "section", "card", "button", "button-sm", "chip", "tag", "tap"],
    },
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "body", "small", "caption", "price"] }],
    },
  },
});
