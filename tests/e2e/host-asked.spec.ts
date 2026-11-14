import { randomBytes, randomInt } from "node:crypto";
import { expect, openAsTestUser, settle, test } from "./fixtures";
import { createTestListing, createTestUser, sql } from "./helpers/db";
import { sealGuestPhone } from "./helpers/field-crypto";

/**
 * Founder's answer (4), 9 Nov 2026: "the host asked me to cancel". The host sees a card on their
 * booking page and confirms (or denies) it; the server records the answer once, only for the
 * booking's host and only within 72 hours (src/lib/booking/host-asked.ts). Another account sees no
 * card and cannot answer. Fake data only (test users, bookings whose message starts with "E2E ").
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const bookingCode = () => `BT-${Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

async function cancelledHostAsked(hoursAgo: number) {
  const host = await createTestUser({ name: "E2E Host Asked Host" });
  const guest = await createTestUser({ name: "E2E Host Asked Guest" });
  const listing = await createTestListing({ ownerId: host.id, title: "E2E host asked flat" });
  const code = bookingCode();
  const phone = sealGuestPhone(guest.phone);
  await sql(
    `INSERT INTO "Booking" (id, code, "listingId", "guestUserId", "hostUserId", "checkIn", "checkOut", nights, adults,
       "nightlyPrice", subtotal, total, currency, "cancellationPolicy", status, "guestName", "guestPhoneEnc", "guestPhoneLookup", locale,
       "rulesAcceptedAt", "messageToHost", "cancelReasonCode", "cancelledAt", "cancelledById", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, (now() + interval '20 days')::date, (now() + interval '22 days')::date, 2, 2, 80, 160, 160, 'USD',
       'MODERATE', 'CANCELLED_BY_GUEST', 'E2E Guest', $6, $7, 'en', now(), 'E2E host asked test', 'HOST_ASKED',
       now() - ($8 || ' hours')::interval, $4, now())`,
    [`e2e${randomBytes(8).toString("hex")}`, code, listing.id, guest.id, host.id, phone.guestPhoneEnc, phone.guestPhoneLookup, String(hoursAgo)],
  );
  return { host, guest, code };
}

async function stateOf(code: string) {
  const [row] = await sql<{ cancelReasonCode: string; flaggedForReview: boolean }>(
    `SELECT "cancelReasonCode", "flaggedForReview" FROM "Booking" WHERE code = $1`,
    [code],
  );
  return row;
}

test("the host confirms 'the host asked me to cancel' on their booking page", async ({ browser }) => {
  const { host, guest, code } = await cancelledHostAsked(2);
  // The guest (another account) gets no card on the host's page (it is not their booking).
  const asGuest = await openAsTestUser(browser, guest);
  try {
    const response = await asGuest.page.goto(`/en/account/host-bookings/${code}`);
    expect(response?.status()).toBe(404);
  } finally {
    await asGuest.context.close();
  }
  const asHost = await openAsTestUser(browser, host);
  try {
    await asHost.page.goto(`/en/account/host-bookings/${code}`);
    await settle(asHost.page);
    const card = asHost.page.locator("section", { has: asHost.page.getByRole("heading", { name: "The guest says you asked them to cancel" }) });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Yes, I asked them to cancel" }).click();
    await expect(asHost.page.getByText("Thank you. We noted that you asked them to cancel.")).toBeVisible();
    await expect.poll(async () => (await stateOf(code)).cancelReasonCode).toBe("HOST_ASKED_CONFIRMED");
    expect((await stateOf(code)).flaggedForReview).toBe(true);
    await asHost.page.reload();
    await expect(card).toHaveCount(0);
    await expect(asHost.page.getByText("The host asked me to cancel (the host confirmed)")).toBeVisible();
  } finally {
    await asHost.context.close();
  }
});

test("after 72 hours the host can no longer answer (no card; the server refuses)", async ({ browser }) => {
  const { host, code } = await cancelledHostAsked(73);
  const asHost = await openAsTestUser(browser, host);
  try {
    await asHost.page.goto(`/en/account/host-bookings/${code}`);
    await settle(asHost.page);
    await expect(asHost.page.getByRole("heading", { name: "The guest says you asked them to cancel" })).toHaveCount(0);
    expect((await stateOf(code)).cancelReasonCode).toBe("HOST_ASKED");
  } finally {
    await asHost.context.close();
  }
});
