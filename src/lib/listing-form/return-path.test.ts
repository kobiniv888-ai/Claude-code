import { describe, expect, it } from "vitest";
import { formReturnPath } from "./return-path";

describe("formReturnPath (bug 2.10: חזרה למודעה)", () => {
  it("accepts the post form of a listing, with its step", () => {
    expect(formReturnPath("/post/cmw14pw8z0003o77dcefphe8a?step=11")).toBe("/post/cmw14pw8z0003o77dcefphe8a?step=11");
    expect(formReturnPath("/he/post/abc123")).toBe("/post/abc123");
    expect(formReturnPath("/account/listings/abc123/edit?step=booking")).toBe("/account/listings/abc123/edit?step=booking");
    expect(formReturnPath(["/post/abc?step=3"])).toBe("/post/abc?step=3");
  });

  it("refuses anything else", () => {
    expect(formReturnPath("https://evil.example/post/abc")).toBeNull();
    expect(formReturnPath("//evil.example/post/abc")).toBeNull();
    expect(formReturnPath("/account/settings")).toBeNull();
    expect(formReturnPath("/post/abc?step=3&next=//evil")).toBeNull();
    expect(formReturnPath("/post/abc/../../admin")).toBeNull();
    expect(formReturnPath(undefined)).toBeNull();
    expect(formReturnPath("")).toBeNull();
  });
});
