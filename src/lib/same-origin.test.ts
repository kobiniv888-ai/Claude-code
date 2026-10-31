import { describe, expect, it } from "vitest";
import { isSameOriginRequest, siteOrigins } from "./same-origin";

const SITE = ["https://bayit.example"];

function post(headers: Record<string, string>, url = "https://bayit.example/api/uploads/private") {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("trusts Sec-Fetch-Site when the browser sends it", () => {
    expect(isSameOriginRequest(post({ "sec-fetch-site": "same-origin" }), SITE)).toBe(true);
    expect(isSameOriginRequest(post({ "sec-fetch-site": "none" }), SITE)).toBe(true);
    expect(isSameOriginRequest(post({ "sec-fetch-site": "cross-site", origin: "https://bayit.example" }), SITE)).toBe(false);
    expect(isSameOriginRequest(post({ "sec-fetch-site": "same-site" }), SITE)).toBe(false);
  });

  it("checks Origin against the site's origins and the request host", () => {
    expect(isSameOriginRequest(post({ origin: "https://bayit.example" }), SITE)).toBe(true);
    expect(isSameOriginRequest(post({ origin: "https://evil.example", host: "bayit.example" }), SITE)).toBe(false);
    expect(isSameOriginRequest(post({ origin: "null" }), SITE)).toBe(false);
    expect(isSameOriginRequest(post({ origin: "not a url" }), SITE)).toBe(false);
    expect(isSameOriginRequest(post({ origin: "http://localhost:3602", host: "localhost:3602" }), SITE)).toBe(true);
  });

  it("allows requests without browser headers (no cookies of a victim)", () => {
    expect(isSameOriginRequest(post({}), SITE)).toBe(true);
  });
});

describe("siteOrigins", () => {
  it("reads the configured site and auth URLs", () => {
    expect(siteOrigins({ NEXT_PUBLIC_SITE_URL: "https://bayit.example/", BETTER_AUTH_URL: "bad" })).toEqual(["https://bayit.example"]);
  });
});
