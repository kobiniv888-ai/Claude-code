// The `cn()` extension: our design tokens (src/app/styles/bayit.css) registered with the class
// merger, so later classes override them as expected. Compiled into
// src/lib/cn-tables.generated.js by `node scripts/generate-cn-tables.mjs` (see src/lib/utils.ts).
// After a change here, run the script and commit both files (src/lib/utils.test.ts checks that
// the compiled tables merge exactly like this config).
const cnConfig = {
  extend: {
    theme: {
      radius: ["card", "input", "button", "sheet"],
      spacing: ["gutter", "section", "card", "button", "button-sm", "chip", "tag", "tap"],
    },
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "body", "small", "caption", "price"] }],
    },
  },
};

export default cnConfig;
