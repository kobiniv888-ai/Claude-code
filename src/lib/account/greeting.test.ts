import { describe, expect, it } from "vitest";
import { accountGreeting, settingsFirstName } from "./greeting";

describe("accountGreeting", () => {
  it("uses the first name of a real account", () => {
    expect(accountGreeting("Yossi Cohen", false)).toEqual({ kind: "name", name: "Yossi" });
    expect(accountGreeting("  נועה  לוי ", false)).toEqual({ kind: "name", name: "נועה" });
    expect(accountGreeting("Demo", false)).toEqual({ kind: "name", name: "Demo" });
  });

  it("prefers the first name and never greets a phone number or an email (bug 8.2)", () => {
    expect(accountGreeting("Noa Levi", false, "נועה")).toEqual({ kind: "name", name: "נועה" });
    expect(accountGreeting("+972 50 123 4567", false)).toEqual({ kind: "none" });
    expect(accountGreeting("995555123456@phone.bayit.invalid", false)).toEqual({ kind: "none" });
    expect(accountGreeting("", false)).toEqual({ kind: "none" });
    expect(accountGreeting("", false, "  Dana ")).toEqual({ kind: "name", name: "Dana" });
    expect(accountGreeting("+995 555 12 34 56", false, "+995 555")).toEqual({ kind: "none" });
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

describe("settingsFirstName (the settings form's first name)", () => {
  it("never prefills a demo account with \"Demo\"", () => {
    expect(settingsFirstName({ name: "Demo Guest — Noa", isDemo: true })).toBe("Noa");
    expect(settingsFirstName({ name: "Demo Owner — Yossi", firstName: null, isDemo: true })).toBe("Yossi");
    expect(settingsFirstName({ name: "Demo Admin", isDemo: true })).toBeNull();
    expect(settingsFirstName({ name: "Demo Owner — Yossi", firstName: "יוסי", isDemo: true })).toBe("יוסי");
  });

  it("uses the saved first name, else the first word of a real name, never a phone or an email", () => {
    expect(settingsFirstName({ name: "Dana Cohen" })).toBe("Dana");
    expect(settingsFirstName({ name: "Dana Cohen", firstName: "דנה" })).toBe("דנה");
    expect(settingsFirstName({ name: "+972 50 123 4567" })).toBeNull();
    expect(settingsFirstName({ name: "dana@example.com" })).toBeNull();
  });
});
