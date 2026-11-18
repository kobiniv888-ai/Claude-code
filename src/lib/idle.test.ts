import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterLoadIdle } from "./idle";

describe("afterLoadIdle", () => {
  let win: EventTarget;
  let doc: { readyState: string };

  beforeEach(() => {
    vi.useFakeTimers();
    win = Object.assign(new EventTarget(), {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
      requestIdleCallback: (fn: () => void) => setTimeout(fn, 10),
      cancelIdleCallback: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    });
    doc = { readyState: "complete" };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("waits for the first interaction, then for idle time, and runs once", () => {
    const run = vi.fn();
    afterLoadIdle(run);
    vi.advanceTimersByTime(4000);
    expect(run).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("touchstart"));
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(run).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs 6 s after load when nobody touches the page", () => {
    const run = vi.fn();
    afterLoadIdle(run);
    vi.advanceTimersByTime(5999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("starts counting at load", () => {
    doc.readyState = "loading";
    const run = vi.fn();
    afterLoadIdle(run);
    win.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(10_000);
    expect(run).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("load"));
    win.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(10);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled before and after the interaction", () => {
    const before = vi.fn();
    afterLoadIdle(before)();
    win.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(10_000);
    expect(before).not.toHaveBeenCalled();

    const after = vi.fn();
    const cancel = afterLoadIdle(after);
    win.dispatchEvent(new Event("wheel"));
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(after).not.toHaveBeenCalled();
  });
});
