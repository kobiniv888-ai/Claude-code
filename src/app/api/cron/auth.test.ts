/**
 * runCronSteps / runCronJob: a job made of independent steps (the daily cleanup) runs every step
 * even when one fails, so one bad step (e.g. a run overlapping another) never skips the report
 * screenshot retention after it; the failure is logged, reported and answered 500.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const reported = vi.hoisted(() => [] as { error: unknown; tags: unknown }[]);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring", () => ({
  reportError: async (error: unknown, context: { tags?: unknown }) => void reported.push({ error, tags: context.tags }),
}));

const { runCronJob, runCronSteps } = await import("./auth");

describe("runCronSteps", () => {
  afterEach(() => {
    reported.length = 0;
    vi.restoreAllMocks();
  });

  it("answers every step's result when all succeed", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const res = await runCronJob("cleanup", () => runCronSteps("cleanup", { a: async () => 1, b: async () => ({ deleted: 2 }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, job: "cleanup", a: 1, b: { deleted: 2 } });
  });

  it("runs the steps after a failing one, reports it and answers 500 with every result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ran: string[] = [];
    const failure = new Error("P2025: record to delete does not exist");
    const res = await runCronJob("cleanup", () =>
      runCronSteps("cleanup", {
        unattachedUploads: async () => {
          ran.push("unattachedUploads");
          throw failure;
        },
        reportScreenshots: async () => {
          ran.push("reportScreenshots");
          return { reports: 3 };
        },
      }),
    );
    expect(ran).toEqual(["unattachedUploads", "reportScreenshots"]);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      ok: false,
      job: "cleanup",
      error: "steps_failed",
      unattachedUploads: { error: "failed" },
      reportScreenshots: { reports: 3 },
    });
    // Reported once, by the step (runCronJob doesn't report it a second time).
    expect(reported).toEqual([{ error: failure, tags: { job: "cleanup", step: "unattachedUploads" } }]);
  });
});
