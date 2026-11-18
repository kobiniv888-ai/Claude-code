import { describe, expect, it, vi } from "vitest";
import { loadOnce } from "./load-once";

describe("loadOnce (the navigation skeletons' loader)", () => {
  it("loads once, then reads the value synchronously", async () => {
    const load = vi.fn(async () => ({ Listing: "listing-skeleton" }));
    const skeletons = loadOnce(load);
    expect(skeletons.get()).toBeNull();
    const [a, b] = await Promise.all([skeletons.preload(), skeletons.preload()]);
    expect(a).toBe(b);
    expect(skeletons.get()).toEqual({ Listing: "listing-skeleton" });
    await skeletons.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never reports a failed load as loaded, and tries again at the next preload", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValueOnce("loaded");
    const skeletons = loadOnce(load);
    // The caller sees the failure (so it does not mark the skeletons ready) …
    await expect(skeletons.preload()).rejects.toThrow("chunk failed");
    expect(skeletons.get()).toBeNull();
    // … and the next tap or idle preload loads them.
    await expect(skeletons.preload()).resolves.toBe("loaded");
    expect(skeletons.get()).toBe("loaded");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
