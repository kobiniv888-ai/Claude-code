/**
 * a11y-3 (round 3 phase-5 hardening): the empty review stars must be visible — 3:1 against the
 * card and the muted surface, in light and dark mode (WCAG 1.4.11), so 3 of 5 never reads as 3
 * of 3. Reads the colour class from stars.tsx and the tokens from src/app/styles/bayit.css.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const stars = fs.readFileSync(path.join(root, "src/components/reviews/stars.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/app/styles/bayit.css"), "utf8");

/** The `--name: #hex;` values of the first top-level block opened by `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {\n  --primary:`);
  expect(start, `${selector} token block`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("review stars", () => {
  // `n <= value ? "fill-current text-foreground" : "text-<token>"`
  const empty = /:\s*"text-([a-z-]+)"\s*\n?\s*\)/.exec(stars)?.[1] ?? /\? "fill-current text-foreground" : "text-([a-z-]+)"/.exec(stars)?.[1];

  it("draws empty stars with a token, not the border colour", () => {
    expect(empty).toBeTruthy();
    expect(empty).not.toBe("border-strong");
    expect(empty).not.toBe("border");
  });

  it.each([":root", ".dark"])("empty stars reach 3:1 on the card and the muted surface (%s)", (selector) => {
    const theme = tokens(selector);
    const colour = theme[empty!];
    expect(colour, `--${empty} in ${selector}`).toMatch(/^#/);
    expect(contrast(colour, theme.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(colour, theme["surface-muted"])).toBeGreaterThanOrEqual(3);
  });
});
