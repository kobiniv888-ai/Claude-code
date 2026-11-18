import { createCn } from "cn/engine";
import tables from "./cn-tables.generated.js";

/**
 * Class-name merger. Our design tokens (src/app/styles/bayit.css) are registered, so later
 * classes override them as expected: the type scale (text-display … text-caption, text-price)
 * as font sizes — cn("text-h1 text-white") keeps both instead of treating text-h1 as a colour —
 * the radii (rounded-card/input/button/sheet) and the spacing names (px-gutter, py-section,
 * p-card, h-button, h-button-sm, h-chip, h-tag, size-tap…), so cn("h-button", "h-auto") → "h-auto".
 *
 * The config is scripts/cn-config.mjs, compiled at development time into
 * ./cn-tables.generated.js (`node scripts/generate-cn-tables.mjs`): the browser gets the tables
 * and the small engine instead of the whole Tailwind config and its compiler (about half the
 * JavaScript, on every page). utils.test.ts checks that both merge alike.
 */
export const cn = createCn(tables);
