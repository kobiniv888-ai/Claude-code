import { describe, expect, it } from "vitest";
import { accountGreeting } from "./greeting";

describe("accountGreeting", () => {
  it("uses the first name of a real account", () => {
    expect(accountGreeting("Yossi Cohen", false)).toEqual({ kind: "name", name: "Yossi" });
    expect(accountGreeting("  נועה  לוי ", false)).toEqual({ kind: "name", name: "נועה" });
    expect(accountGreeting("Demo", false)).toEqual({ kind: "name", name: "Demo" });
  });

  it("greets a demo account by its personal name part", () => {
    expect(accountGreeting("Demo Owner — Yossi", true)).toEqual({ kind: "demoName", name: "Yossi" });
    expect(accountGreeting("Demo Guest - Noa Levi", true)).toEqual({ kind: "demoName", name: "Noa" });
    expect(accountGreeting("Demo Owner – Natela", true)).toEqual({ kind: "demoName", name: "Natela" });
  });

  it("greets a demo account without a personal name neutrally", () => {
    expect(accountGreeting("Demo Admin", true)).toEqual({ kind: "demo" });
    expect(accountGreeting("Demo Hotel Batumi", true)).toEqual({ kind: "demo" });
    expect(accountGreeting("Demo-Owner", true)).toEqual({ kind: "demo" });
  });
});
