import { randomBytes, randomInt } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { loginThroughForm } from "./helpers/auth";
import { createTestListing, createTestUser, freshPhone, newId, sql, TEST_EMAIL_DOMAIN } from "./helpers/db";
import { sealGuestPhone } from "./helpers/field-crypto";
import { TERMS_VERSION } from "../../src/lib/legal/terms";

/**
 * Security round S2 (founder's answers of 9 November 2026), the parts a unit test cannot prove:
 * - (5) a phone-check code request gets the SAME answer whether or not another account already has
 *   the number (no "number already used"), and nothing about the other account changes;
 * - (5) an account without a real email (a phone-only account) is asked for one at sign-in, and the
 *   confirmed address becomes its login email;
 * - 14.3.c + D5: a guest with an upcoming booking sees "the host's contact details changed
 *   recently" on the trip page for 7 days after the host changed them, never after.
 * Fake data only: test users (+995 555 99x xxx, @e2e.bayit.invalid), bookings whose message to the
 * host starts with "E2E " (removed by the global clean-up).
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const bookingCode = () => `BT-${Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

/** An account with a real (test) email and no phone, signed in through a test session. */
async function createEmailOnlyUser(name: string): Promise<{ id: string; email: string }> {
  const id = newId();
  const email = `e2e-${id}@${TEST_EMAIL_DOMAIN}`;
  await sql(
    `INSERT INTO "User" (id, name, "firstName", email, "emailVerified", role, locale, "updatedAt")
     VALUES ($1, $2, 'E2E', $3, true, 'USER', 'en', now())`,
    [id, name, email],
  );
  await sql(`INSERT INTO "TermsAcceptance" (id, "userId", version, "ageConfirmed", "acceptedAt") VALUES ($1, $2, $3, true, now())`, [
    newId(),
    id,
    TERMS_VERSION,
  ]);
  return { id, email };
}

/** The `{ ok, data }` answer of a server action, from its RSC response body. */
function actionAnswer(body: string): { ok: boolean; data?: Record<string, unknown>; error?: unknown } | null {
  for (const line of body.split("\n")) {
    const match = line.match(/^[0-9a-f]+:(\{.*\})\s*$/);
    if (match && match[1].includes('"ok"')) return JSON.parse(match[1]);
  }
  return null;
}

/**
 * Records the bodies of the server-action answers of this page (read through route.fetch, so a
 * streamed answer is complete even when the page moves on).
 */
async function recordActions(page: Page): Promise<string[]> {
  const bodies: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.fallback();
    const response = await route.fetch();
    bodies.push(await response.text());
    await route.fulfill({ response });
  });
  return bodies;
}

/** The newest recorded action answer that carries `key`. */
async function latestAnswerWith(bodies: string[], key: string) {
  let found: ReturnType<typeof actionAnswer> = null;
  await expect
    .poll(() => {
      for (const body of [...bodies].reverse()) {
        const answer = actionAnswer(body);
        if (answer && JSON.stringify(answer).includes(`"${key}"`)) return (found = answer) && true;
      }
      return false;
    })
    .toBe(true);
  return found as unknown as NonNullable<ReturnType<typeof actionAnswer>>;
}

/** Chooses +995, types the national number and presses "Send code"; returns the action's answer. */
async function requestPhoneCheckCode(page: Page, bodies: string[], phone: string) {
  const country = page.getByRole("button", { name: /^Country code/ });
  if (!((await country.textContent()) ?? "").includes("+995")) {
    await country.click();
    await page.getByPlaceholder("Search country or code").fill("995");
    await page.getByRole("option", { name: /\+995/ }).click();
  }
  await page.getByRole("textbox", { name: "Phone number" }).fill(phone.replace(/^\+995/, ""));
  bodies.length = 0;
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  return latestAnswerWith(bodies, "status");
}

test("a phone-check code for a number another account has gets the same answer as a free number (founder's answer 5)", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Number Owner" });
  const free = await freshPhone();
  const user = await createEmailOnlyUser("E2E Phone Checker");
  const { context, page, consoleErrors } = await openAsTestUser(browser, user);
  const bodies = await recordActions(page);
  try {
    // The post form's phone step (a signed 2-hour token lets an account without a listing ask).
    await page.goto(`/en/verify-phone?next=${encodeURIComponent("/en/post")}`);
    await settle(page);
    const taken = await requestPhoneCheckCode(page, bodies, owner.phone);
    const takenText = (await page.locator("main").innerText()).replace(/\d/g, "#");
    expect(takenText).not.toMatch(/already (used|belongs|registered|taken)|another account/i);

    // The same page again, for a number nobody has.
    await page.goto(`/en/verify-phone?next=${encodeURIComponent("/en/post")}`);
    await settle(page);
    const fresh = await requestPhoneCheckCode(page, bodies, free);

    // The same answer: "sent", the same keys. Test mode alone (codes on screen, development and
    // staging only) shows a code for the free number; never for the taken one.
    expect(taken).toMatchObject({ ok: true, data: { status: "sent", screenCode: null } });
    expect(fresh).toMatchObject({ ok: true, data: { status: "sent" } });
    const shape = (answer: typeof taken) => ({ ...answer, data: { ...answer?.data, phoneNumber: "<number>", screenCode: "<code>" } });
    expect(shape(taken)).toEqual(shape(fresh));

    // Nobody received a code for the taken number: even a guess fails like a mistyped code.
    await page.goto(`/en/verify-phone?next=${encodeURIComponent("/en/post")}`);
    await settle(page);
    await requestPhoneCheckCode(page, bodies, owner.phone);
    await page.getByLabel("6-digit code").fill(String(randomInt(100000, 999999)));
    await expect(page.getByText(/That code isn't right|Too many wrong codes|already sent you a code/).first()).toBeVisible();

    // The other account is untouched, and the asking account did not get the number.
    const [ownerRow] = await sql<{ phoneNumber: string; phoneNumberVerified: boolean }>(
      `SELECT "phoneNumber", "phoneNumberVerified" FROM "User" WHERE id = $1`,
      [owner.id],
    );
    expect(ownerRow).toEqual({ phoneNumber: owner.phone, phoneNumberVerified: true });
    const [userRow] = await sql<{ phoneNumber: string | null }>(`SELECT "phoneNumber" FROM "User" WHERE id = $1`, [user.id]);
    expect(userRow.phoneNumber).toBeNull();
    expect(consoleErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("a phone-only account is asked for its email at sign-in, and the confirmed address becomes its login email (founder's answer 5)", async ({ browser }) => {
  const phone = await freshPhone();
  const id = newId();
  // A phone-only account as older sign-ups had it: a placeholder email on phone.bayit.invalid.
  await sql(
    `INSERT INTO "User" (id, name, "firstName", email, "emailVerified", "phoneNumber", "phoneNumberVerified", role, locale, "updatedAt")
     VALUES ($1, 'E2E Phone Only', 'E2E', $2, false, $3, true, 'USER', 'en', now())`,
    [id, `${phone.slice(1)}@phone.bayit.invalid`, phone],
  );
  await sql(`INSERT INTO "TermsAcceptance" (id, "userId", version, "ageConfirmed", "acceptedAt") VALUES ($1, $2, $3, true, now())`, [
    newId(),
    id,
    TERMS_VERSION,
  ]);
  const { context, page, consoleErrors } = await openAs(browser, null);
  const bodies = await recordActions(page);
  try {
    await page.goto("/en/login");
    await settle(page);
    await loginThroughForm(page, phone);
    // The login panel's "add your email" step, before anything else.
    await expect(page.getByText("Add your email address", { exact: true })).toBeVisible({ timeout: 30_000 });
    const email = `e2e-added-${randomBytes(4).toString("hex")}@${TEST_EMAIL_DOMAIN}`;
    await page.getByRole("textbox", { name: "Email address" }).fill(email);
    bodies.length = 0;
    await page.getByRole("button", { name: "Send code" }).click();
    // The code goes to the new address; test mode (development / staging) also returns it to the screen.
    const sent = await latestAnswerWith(bodies, "sentTo");
    expect(sent).toMatchObject({ ok: true, data: { sent: true } });
    const code = String((sent.data as { screenCode?: string }).screenCode ?? "");
    expect(code).toMatch(/^\d{6}$/);
    await page.getByLabel("6-digit code").fill(code);
    const confirm = page.getByRole("button", { name: "Confirm" });
    if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => undefined);
    await expect
      .poll(async () => (await sql<{ email: string; emailVerified: boolean }>(`SELECT email, "emailVerified" FROM "User" WHERE id = $1`, [id]))[0])
      .toEqual({ email, emailVerified: true });
    await expect(page.getByText("Add your email address", { exact: true })).toBeHidden();
    expect(consoleErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("a guest sees 'the host's contact details changed recently' on the trip page for 7 days, then no more (14.3.c)", async ({ browser }) => {
  const host = await createTestUser({ name: "E2E Contact Host" });
  const guest = await createTestUser({ name: "E2E Contact Guest" });
  const listing = await createTestListing({ ownerId: host.id, title: `E2E contact changed flat ${Date.now().toString(36)}` });
  const code = bookingCode();
  const phone = sealGuestPhone(guest.phone);
  await sql(
    `INSERT INTO "Booking" (id, code, "listingId", "guestUserId", "hostUserId", "checkIn", "checkOut", nights, adults,
       "nightlyPrice", subtotal, total, currency, "cancellationPolicy", status, "guestName", "guestPhoneEnc", "guestPhoneLookup", locale,
       "rulesAcceptedAt", "messageToHost", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, (now() + interval '20 days')::date, (now() + interval '22 days')::date, 2, 2, 80, 160, 160, 'USD',
       'MODERATE', 'CONFIRMED', 'E2E Guest', $6, $7, 'en', now(), 'E2E contact changed test', now())`,
    [`e2e${randomBytes(8).toString("hex")}`, code, listing.id, guest.id, host.id, phone.guestPhoneEnc, phone.guestPhoneLookup],
  );
  const title = "The host's contact details changed recently";
  const { context, page, consoleErrors } = await openAsTestUser(browser, guest);
  try {
    // No change yet: no notice.
    await page.goto(`/en/account/trips/${code}`);
    await settle(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    // The host changed them an hour ago (written by the post form after a fresh code).
    await sql(`UPDATE "Listing" SET "contactChangedAt" = now() - interval '1 hour' WHERE id = $1`, [listing.id]);
    await page.reload();
    await settle(page);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(/Never pay in advance — you pay the host when you arrive/).first()).toBeVisible();

    // Eight days later the notice is gone.
    await sql(`UPDATE "Listing" SET "contactChangedAt" = now() - interval '8 days' WHERE id = $1`, [listing.id]);
    await page.reload();
    await settle(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
