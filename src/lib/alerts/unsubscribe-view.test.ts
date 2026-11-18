import { describe, expect, it } from "vitest";
import { unsubscribePlan } from "./unsubscribe-view";

const plan = (state: string, current: boolean | null, retryOn = false) => unsubscribePlan({ valid: true, current, state, retryOn });

describe("the unsubscribe page", () => {
  it("retries the change that failed: turning back on stays turning on (unsub-1)", () => {
    expect(plan("error", false, true)).toMatchObject({ view: "error", showsForm: true, turnOn: true, label: "retry" });
    expect(plan("error", true, false)).toMatchObject({ view: "error", showsForm: true, turnOn: false, label: "retry" });
  });

  it("keeps the other states", () => {
    expect(plan("", true)).toMatchObject({ view: "confirm", turnOn: false, label: "turnOff", showsForm: true, done: false });
    expect(plan("", false)).toMatchObject({ view: "alreadyOff", turnOn: true, label: "turnOn" });
    expect(plan("off", false)).toMatchObject({ view: "off", done: true, turnOn: true, label: "turnOn" });
    expect(plan("on", true)).toMatchObject({ view: "on", done: true, showsForm: false });
    expect(plan("limited", true)).toMatchObject({ view: "limited", showsForm: false });
    expect(unsubscribePlan({ valid: false, current: null, state: "", retryOn: false })).toMatchObject({ view: "invalid", showsForm: false });
  });
});
