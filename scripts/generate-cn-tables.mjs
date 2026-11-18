// Compiles the class merger's tables for our config (scripts/cn-config.mjs) into
// src/lib/cn-tables.generated.js.
//
//   node scripts/generate-cn-tables.mjs
//
// Why: `createCn(config)` from "cn/config" ships the whole Tailwind config and its compiler to
// the browser and compiles on the first call (~28 KB gzip of JavaScript on every page, plus a few
// ms of work at hydration). The compiled tables with the small "cn/engine" runtime merge exactly
// the same way at about half the size. `full` keeps every class group (no subsetting by the
// classes found in the sources), so class names built at runtime merge as before; `css: false`
// registers only the scales named in the config, as `createCn(config)` does.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "cn/build";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  cwd: root,
  full: true,
  css: false,
  config: "scripts/cn-config.mjs",
  out: "src/lib/cn-tables.generated.js",
});
for (const warning of result.warnings) console.warn(`cn: ${warning}`);
console.log(`${path.relative(root, result.outPath)} ${result.changed ? "written" : "unchanged"} (${result.source.length} bytes)`);
