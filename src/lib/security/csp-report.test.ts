import { describe, expect, it } from "vitest";
import { blockedOrigin, CSP_REPORTS_PER_REQUEST, pagePath, parseCspReports } from "./csp-report";

describe("parseCspReports (SECURITY_REPORT 10.2.c)", () => {
  it("reads the report-uri format", () => {
    const [v] = parseCspReports({
      "csp-report": {
        "document-uri": "https://bayit.example/he/search?city=batumi&token=secret",
        "violated-directive": "img-src 'self' data:",
        "effective-directive": "img-src",
        "blocked-uri": "https://evil.example/pixel.gif?u=someone%40example.com",
        disposition: "report",
        "source-file": "https://bayit.example/_next/static/chunks/app.js",
      },
    });
    expect(v).toEqual({ directive: "img-src", blocked: "https://evil.example", page: "/he/search", disposition: "report", source: "https://bayit.example" });
  });

  it("reads the Reporting API format and ignores other report types", () => {
    const list = parseCspReports([
      { type: "deprecation", body: { id: "x" } },
      {
        type: "csp-violation",
        url: "https://bayit.example/he/lists/AbCdEfGhIjKlMnOpQrStUvWxYz012345",
        body: {
          documentURL: "https://bayit.example/he/lists/AbCdEfGhIjKlMnOpQrStUvWxYz012345",
          effectiveDirective: "script-src-elem",
          blockedURL: "inline",
          disposition: "enforce",
        },
      },
    ]);
    expect(list).toEqual([{ directive: "script-src-elem", blocked: "inline", page: "/he/lists/:id", disposition: "enforce", source: null }]);
  });

  it("keeps only origins and paths: never a query, a long token or a numeric id", () => {
    expect(blockedOrigin("https://a.example:8443/x?y=1")).toBe("https://a.example:8443");
    expect(blockedOrigin("data")).toBe("data");
    expect(blockedOrigin("chrome-extension://abc/script.js")).toBe("chrome-extension");
    expect(blockedOrigin("not a url")).toBe("other");
    expect(pagePath("https://bayit.example/he/listing/123-flat-in-batumi?x=1")).toBe("/he/listing/:id");
    expect(pagePath("https://bayit.example/")).toBe("/");
    expect(pagePath("nonsense")).toBeNull();
  });

  it("drops reports without a directive, junk and anything past the per-request cap", () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports("x")).toEqual([]);
    expect(parseCspReports({ "csp-report": { "blocked-uri": "inline" } })).toEqual([]);
    const many = Array.from({ length: 20 }, () => ({ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://x.example/a" } }));
    expect(parseCspReports(many)).toHaveLength(CSP_REPORTS_PER_REQUEST);
  });
});
