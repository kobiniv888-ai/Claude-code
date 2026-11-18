import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RECOVERY_ALPHABET, RECOVERY_CODE_COUNT, formatRecoveryCode, looksLikeRecoveryCode, normalizeRecoveryCode, recoveryCodesFile } from "./recovery-code-format";

/** SECURITY_REPORT 3.7.c: 10 one-time recovery codes, 50 random bits each. */
describe("recovery code format", () => {
  it("makes 10-character codes from 32 unambiguous characters", () => {
    expect(RECOVERY_CODE_COUNT).toBe(10);
    expect(RECOVERY_ALPHABET).toHaveLength(32);
    expect(RECOVERY_ALPHABET).not.toMatch(/[ILOU]/);
    for (let i = 0; i < 50; i++) expect(formatRecoveryCode(randomBytes(16))).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(() => formatRecoveryCode(new Uint8Array(4))).toThrow();
  });

  it("reads typed codes forgivingly, and nothing else", () => {
    expect(normalizeRecoveryCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeRecoveryCode(" ABCDE FGHJK ")).toBe("ABCDEFGHJK");
    expect(normalizeRecoveryCode("O1IL0-22222")).toBe("01110" + "22222");
    expect(normalizeRecoveryCode("123456")).toBeNull();
    expect(normalizeRecoveryCode("ABCDE-FGHJU")).toBeNull();
    expect(normalizeRecoveryCode(42)).toBeNull();
    expect(looksLikeRecoveryCode("123456")).toBe(false);
  });

  it("writes the download file with the codes numbered", () => {
    const file = recoveryCodesFile(["AAAAA-BBBBB", "CCCCC-DDDDD"], { title: "T", intro: "I", footer: "F" });
    expect(file).toBe("T\n\nI\n\n 1. AAAAA-BBBBB\n 2. CCCCC-DDDDD\n\nF\n");
  });
});
