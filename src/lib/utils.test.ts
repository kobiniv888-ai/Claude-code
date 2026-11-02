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
