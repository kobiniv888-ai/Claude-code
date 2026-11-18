import { describe, expect, it } from "vitest";
import { hasWelcomePledge, pledgeStatus, pledgeVersionKey, requiredPledgeVersion } from "./pledge";

describe("welcome pledge", () => {
  it("is valid for the badge from the required version up", () => {
    expect(hasWelcomePledge({ welcomePledgeVersion: 1 }, { pledgeRequiredVersion: 1 }, 1)).toBe(true);
    expect(hasWelcomePledge({ welcomePledgeVersion: 1 }, { pledgeRequiredVersion: 2 }, 2)).toBe(false);
    expect(hasWelcomePledge({ welcomePledgeVersion: 1 }, { pledgeRequiredVersion: 1 }, 2)).toBe(true);
    expect(hasWelcomePledge({ welcomePledgeVersion: null }, { pledgeRequiredVersion: 1 }, 1)).toBe(false);
    expect(hasWelcomePledge(null, { pledgeRequiredVersion: 1 }, 1)).toBe(false);
  });

  it("never requires more than the current version", () => {
    expect(requiredPledgeVersion({ pledgeRequiredVersion: 5 }, 2)).toBe(2);
    expect(requiredPledgeVersion({ pledgeRequiredVersion: 0 }, 2)).toBe(1);
    expect(requiredPledgeVersion({ pledgeRequiredVersion: Number.NaN }, 2)).toBe(2);
  });

  it("asks hosts with an older wording to accept again", () => {
    const at = new Date("2026-10-01T10:00:00.000Z");
    expect(pledgeStatus({ welcomePledgeVersion: 1, welcomePledgeAcceptedAt: at }, { pledgeRequiredVersion: 1 }, 2)).toEqual({
      accepted: true,
      version: 1,
      acceptedAt: at.toISOString(),
      currentVersion: 2,
      isCurrent: false,
      mustReaccept: true,
      badgeValid: true,
    });
    expect(pledgeStatus({ welcomePledgeVersion: 2, welcomePledgeAcceptedAt: at }, { pledgeRequiredVersion: 2 }, 2)).toMatchObject({
      isCurrent: true,
      mustReaccept: false,
      badgeValid: true,
    });
    expect(pledgeStatus(null, { pledgeRequiredVersion: 1 }, 1)).toMatchObject({
      accepted: false,
      version: null,
      isCurrent: false,
      mustReaccept: false,
      badgeValid: false,
    });
    expect(pledgeVersionKey(3)).toBe("versions.v3");
  });
});
