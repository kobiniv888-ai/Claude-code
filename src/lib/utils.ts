import { createCn } from "cn/config";

/**
 * Class-name merger. Our type scale (globals.css: text-display … text-caption) is registered as
 * font sizes, so cn("text-h1 text-white") keeps both instead of treating text-h1 as a colour.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "body", "small", "caption"] }],
    },
  },
});
