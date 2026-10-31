import { describe, expect, it } from "vitest";
import { addDismissed, alertKey } from "./dismissed-alerts";

describe("alertKey", () => {
  it("combines the id and the last edit time", () => {
    expect(alertKey("clx1abc", new Date(0))).toBe("clx1abc-0");
    expect(alertKey("CLX1", new Date(1_700_000_000_000))).toBe(`clx1-${(1_700_000_000_000).toString(36)}`);
  });
  it("rejects ids that are unsafe in a CSS selector", () => {
    expect(alertKey('a"]{}', new Date(0))).toBeNull();
    expect(alertKey("a b", new Date(0))).toBeNull();
  });
});

describe("addDismissed", () => {
  it("appends without duplicates", () => {
    expect(addDismissed(null, "a-1")).toBe("a-1");
    expect(addDismissed("a-1 b-2", "a-1")).toBe("b-2 a-1");
    expect(addDismissed("  ", "c-3")).toBe("c-3");
  });
  it("keeps the newest 20", () => {
    const list = Array.from({ length: 25 }, (_, i) => `k-${i}`).join(" ");
    const next = addDismissed(list, "new-1").split(" ");
    expect(next).toHaveLength(20);
    expect(next.at(-1)).toBe("new-1");
    expect(next[0]).toBe("k-6");
  });
});
