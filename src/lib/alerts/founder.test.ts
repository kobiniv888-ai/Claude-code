import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const admins: { email: string; contactEmail: string | null; locale: string }[] = [];
const findMany = vi.fn(async () => admins);
vi.mock("@/lib/db", () => ({ db: { user: { findMany } } }));
const sent: { to: string; outboxOnly?: boolean }[] = [];
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: vi.fn(async (input: { to: string; outboxOnly?: boolean }) => (sent.push(input), { ok: true, delivery: "logged" })) };
});

const { founderAlertEmail, founderAlertRecipients, sendFounderAlert, FOUNDER_OUTBOX_ADDRESS } = await import("./founder");

const ALERT = { kind: "host_unreachable" as const, reason: "failed" };

afterEach(() => {
  delete process.env.ADMIN_ALERT_EMAIL;
  admins.length = 0;
  sent.length = 0;
  findMany.mockClear();
});

describe("founderAlertEmail", () => {
  it("reads ADMIN_ALERT_EMAIL: several addresses, lower-case, no duplicates, only real ones", () => {
    expect(founderAlertEmail({ ADMIN_ALERT_EMAIL: " Alerts@Example.com, ops@example.com;alerts@example.com " })).toEqual(["alerts@example.com", "ops@example.com"]);
    expect(founderAlertEmail({ ADMIN_ALERT_EMAIL: "not-an-address, 995555000001@phone.bayit.invalid" })).toEqual([]);
    expect(founderAlertEmail({})).toEqual([]);
  });
});

describe("where founder alerts go", () => {
  it("ADMIN_ALERT_EMAIL first, without asking the database", async () => {
    process.env.ADMIN_ALERT_EMAIL = "alerts@example.com";
    expect(await founderAlertRecipients()).toEqual([{ to: "alerts@example.com", locale: "he" }]);
    expect(findMany).not.toHaveBeenCalled();
  });
  it("else the real admin accounts' real addresses (never a phone placeholder)", async () => {
    admins.push(
      { email: "admin@example.com", contactEmail: null, locale: "en" },
      { email: "995555000009@phone.bayit.invalid", contactEmail: null, locale: "he" },
      { email: "995555000008@phone.bayit.invalid", contactEmail: "Admin@Example.com", locale: "ru" },
    );
    expect(await founderAlertRecipients()).toEqual([{ to: "admin@example.com", locale: "en" }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { role: "ADMIN", isDemo: false, deletedAt: null } }));
  });
  it("else the outbox only", async () => {
    await sendFounderAlert(ALERT);
    expect(sent).toEqual([expect.objectContaining({ to: FOUNDER_OUTBOX_ADDRESS, outboxOnly: true })]);
  });
  it("sends to every configured address", async () => {
    process.env.ADMIN_ALERT_EMAIL = "a@example.com,b@example.com";
    await sendFounderAlert(ALERT);
    expect(sent.map((s) => s.to)).toEqual(["a@example.com", "b@example.com"]);
  });
});
