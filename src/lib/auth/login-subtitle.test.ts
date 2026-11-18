import { describe, expect, it } from "vitest";
import { loginSubtitleKey } from "./login-subtitle";

const config = (google: boolean, email: boolean) => ({ providers: { google, apple: false }, email: { available: email } });

describe("loginSubtitleKey", () => {
  it("only mentions the ways in that are offered", () => {
    expect(loginSubtitleKey(config(true, true))).toBe("dialogSubtitle");
    expect(loginSubtitleKey(config(false, true))).toBe("dialogSubtitleNoSocial");
    expect(loginSubtitleKey(config(true, false))).toBe("dialogSubtitleSocialOnly");
    expect(loginSubtitleKey(config(false, false))).toBe("dialogSubtitleUnavailable");
  });
});
