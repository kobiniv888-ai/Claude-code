/**
 * Founder's answer (5): a phone check for a number another account has runs the whole send (limits,
 * stored code) inside withNeutralPhoneSend; the plugin's sendOTP (./server.ts) then sends nothing
 * and waits about as long as a real send, so the answer and its timing match a free number's.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { NEUTRAL_SEND_DELAY_MS, isNeutralPhoneSend, neutralSendDelay, withNeutralPhoneSend } = await import("./phone-neutral");

describe("neutral phone sends", () => {
  it("only the code inside a neutral send sees it, also across awaits; other sends never do", async () => {
    expect(isNeutralPhoneSend()).toBe(false);
    const seen: boolean[] = [];
    await Promise.all([
      withNeutralPhoneSend(true, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(isNeutralPhoneSend());
      }),
      withNeutralPhoneSend(false, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        seen.push(isNeutralPhoneSend());
      }),
    ]);
    expect(seen.sort()).toEqual([false, true]);
    expect(isNeutralPhoneSend()).toBe(false);
  });

  it("waits like a provider round trip (within NEUTRAL_SEND_DELAY_MS)", async () => {
    vi.useFakeTimers();
    try {
      const previous = process.env.NEUTRAL_SEND_DELAY;
      delete process.env.NEUTRAL_SEND_DELAY;
      let done = false;
      const wait = neutralSendDelay().then(() => (done = true));
      await vi.advanceTimersByTimeAsync(NEUTRAL_SEND_DELAY_MS.min - 1);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(NEUTRAL_SEND_DELAY_MS.max);
      await wait;
      expect(done).toBe(true);
      if (previous !== undefined) process.env.NEUTRAL_SEND_DELAY = previous;
    } finally {
      vi.useRealTimers();
    }
  });
});
