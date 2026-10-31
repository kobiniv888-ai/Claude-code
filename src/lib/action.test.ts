import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { notFound, redirect } from "next/navigation";
import { fail, ok, runAction, toActionError } from "./action";
import {
  AppError,
  AuthRequiredError,
  CaptchaError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ShabbatModeError,
  ValidationError,
  errorMessageKey,
} from "./errors";

describe("ok / fail", () => {
  it("builds results", () => {
    expect(ok()).toEqual({ ok: true, data: undefined });
    expect(ok({ id: "x" })).toEqual({ ok: true, data: { id: "x" } });
    expect(fail("not_found")).toEqual({ ok: false, error: "not_found" });
    expect(fail("invalid_input", { title: ["too_short"] })).toEqual({
      ok: false,
      error: "invalid_input",
      fieldErrors: { title: ["too_short"] },
    });
  });
});

describe("toActionError", () => {
  it("maps every error class to its code", () => {
    expect(toActionError(new RateLimitError(new Date())).error).toBe("rate_limited");
    expect(toActionError(new ShabbatModeError(null)).error).toBe("shabbat_mode");
    expect(toActionError(new AuthRequiredError()).error).toBe("auth_required");
    expect(toActionError(new ForbiddenError()).error).toBe("forbidden");
    expect(toActionError(new NotFoundError()).error).toBe("not_found");
    expect(toActionError(new CaptchaError()).error).toBe("captcha_failed");
    expect(toActionError(new ValidationError({ price: ["required"] }))).toEqual({
      ok: false,
      error: "invalid_input",
      fieldErrors: { price: ["required"] },
    });
  });

  it("turns zod errors into field errors", () => {
    const parsed = z.object({ title: z.string().min(3) }).safeParse({ title: "a" });
    const result = toActionError(parsed.error);
    expect(result.error).toBe("invalid_input");
    expect(result.fieldErrors?.title?.length).toBe(1);
  });

  it("passes feature codes through and hides unknown errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toActionError(new AppError("file_too_large", "big", { status: 413 })).error).toBe("file_too_large");
    expect(toActionError(new Error("db password leaked in message"))).toEqual({ ok: false, error: "server_error" });
    expect(toActionError(new AppError("boom", "internal", { status: 500 })).error).toBe("server_error");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("re-throws Next.js redirect and notFound", () => {
    expect(() => {
      try {
        redirect("/he");
      } catch (e) {
        toActionError(e);
      }
    }).toThrow();
    expect(() => {
      try {
        notFound();
      } catch (e) {
        toActionError(e);
      }
    }).toThrow();
  });

  it("runAction catches thrown errors", async () => {
    await expect(
      runAction(async () => {
        throw new ForbiddenError();
      }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(runAction(async () => ok(5))).resolves.toEqual({ ok: true, data: 5 });
  });
});

describe("errorMessageKey", () => {
  it("falls back to server_error for unknown codes", () => {
    expect(errorMessageKey("network")).toBe("network");
    expect(errorMessageKey("something_else")).toBe("server_error");
    expect(errorMessageKey(undefined)).toBe("server_error");
  });
});
