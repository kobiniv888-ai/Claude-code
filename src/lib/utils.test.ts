import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps our type-scale sizes next to a text colour", () => {
    expect(cn("text-h1 text-white")).toBe("text-h1 text-white");
    expect(cn("text-caption text-muted-foreground")).toBe("text-caption text-muted-foreground");
  });

  it("still merges conflicting sizes and colours", () => {
    expect(cn("text-h2", "text-h1")).toBe("text-h1");
    expect(cn("text-sm", "text-body")).toBe("text-body");
    expect(cn("text-white", "text-primary")).toBe("text-primary");
  });
});

describe("cn compiled tables", () => {
  // The browser gets tables compiled from scripts/cn-config.mjs (scripts/generate-cn-tables.mjs).
  // They must merge exactly like the config itself: every class list in our components, alone and
  // followed by the next one (so overrides between unrelated lists are covered too).
  it("merges every class list in src/ like createCn(config)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { createCn } = await import("cn/config");
    const config = (await import("../../scripts/cn-config.mjs")).default;
    const reference = createCn(config);

    const lists = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "generated") walk(file);
        } else if (/\.tsx?$/.test(entry.name)) {
          for (const match of fs.readFileSync(file, "utf8").matchAll(/"([^"\n]{3,})"/g)) {
            if (/(^|\s)[a-z!-][\w:./[\]()%#,!*&>~=+-]*-[\w:./[\]()%#,!*&>~=+-]*(\s|$)/.test(match[1])) lists.add(match[1]);
          }
        }
      }
    };
    walk(path.resolve(__dirname, ".."));
    const all = [...lists].sort();
    expect(all.length).toBeGreaterThan(1000);
    const mismatches: string[] = [];
    all.forEach((list, index) => {
      const next = all[(index + 1) % all.length];
      for (const input of [list, `${list} ${next}`]) {
        if (cn(input) !== reference(input)) mismatches.push(input);
      }
    });
    expect(mismatches).toEqual([]);
  });
});
