import type { Locator, Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { createTestListing, createTestUser, sql } from "./helpers/db";

/**
 * Round 3, brief 3 (post page and form):
 * - step 9 (Jewish-friendly details) is "Optional" and has "Skip", which keeps what was ticked
 *   and moves on like Next (the step stays in the address);
 * - the check-in / check-out pickers offer only the usual times every 30 minutes plus "Flexible";
 *   a time saved before that is not in the list stays as an option and is never changed;
 * - "Flexible" shows as "Flexible check-in" / "Flexible check-out" on the listing page.
 */

async function choose(input: Locator) {
  await input.locator("xpath=ancestor::label[1]").click();
  await expect(input).toBeChecked();
}

async function expectStep(page: Page, step: number, heading: string) {
  await expect(page).toHaveURL(new RegExp(`[?&]step=${step}(&|$)`));
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText("Loading your saved answers…")).toHaveCount(0);
}

/** Waits until the auto-save has written `expected` for the listing. */
async function expectSaved(id: string, column: string, expected: unknown) {
  await expect
    .poll(async () => (await sql<Record<string, unknown>>(`SELECT "${column}" AS v FROM "Listing" WHERE id = $1`, [id]))[0]?.v, { timeout: 20_000 })
    .toEqual(expected);
}

test("step 9 is optional: Skip keeps the ticks and moves on; check-in/out pickers offer usual times and Flexible", async ({ browser }) => {
  test.slow();
  const owner = await createTestUser({ name: "E2E Times Host" });
  const draft = await createTestListing({ ownerId: owner.id, title: `E2E Times draft ${Date.now().toString(36)}`, status: "DRAFT", photos: 6 });
  await sql(
    `UPDATE "Listing" SET "shabbatFeatures" = '{}', "checkInFrom" = '10:00', "checkOutUntil" = '11:00', "checkInFlexible" = false, "checkOutFlexible" = false WHERE id = $1`,
    [draft.id],
  );
  const { context, page, consoleErrors } = await openAs(browser, owner.phone);

  // ── Step 9: "Optional", the new subtitle, and "Skip" ──
  await page.goto(`/en/post/${draft.id}?step=9`);
  await settle(page);
  await expectStep(page, 9, "Jewish-friendly details");
  await expect(page.getByText("Optional", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Fill in only what the place has. Guests who keep kosher or Shabbat filter by these details.")).toBeVisible();
  await choose(page.getByRole("checkbox", { name: /^Hot plate/ }));
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expectStep(page, 10, "Add photos");
  // Skip saved what was ticked.
  await expectSaved(draft.id, "shabbatFeatures", ["hot_plate"]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectStep(page, 9, "Jewish-friendly details");
  await expect(page.getByRole("checkbox", { name: /^Hot plate/ })).toBeChecked();
  // Only step 9 has Skip.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expectStep(page, 10, "Add photos");
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toHaveCount(0);

  // ── Step 11: the pickers ──
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expectStep(page, 11, "Bookings and price");
  const checkIn = page.getByRole("combobox", { name: /^Check-in time/ });
  const checkOut = page.getByRole("combobox", { name: /^Check-out time/ });
  // The saved 10:00 is kept (an extra option before the usual 12:00–22:00), in English 12-hour form.
  await expect(checkIn).toHaveValue("10:00");
  const inOptions = await checkIn.locator("option").allTextContents();
  expect(inOptions).toEqual(["Not set", "Flexible", "10:00 AM", ...Array.from({ length: 21 }, (_, i) => clock12(12 * 60 + i * 30))]);
  const outOptions = await checkOut.locator("option").allTextContents();
  expect(outOptions).toEqual(["Not set", "Flexible", ...Array.from({ length: 15 }, (_, i) => clock12(7 * 60 + i * 30))]);
  await expect(checkOut).toHaveValue("11:00");

  // "Flexible" empties the time; a time turns it off again.
  await checkIn.selectOption("flex");
  await expectSaved(draft.id, "checkInFlexible", true);
  await expectSaved(draft.id, "checkInFrom", null);
  await checkOut.selectOption("10:30");
  await expectSaved(draft.id, "checkOutUntil", "10:30");
  await expectSaved(draft.id, "checkOutFlexible", false);

  // After a reload the choices are still there; the 10:00 option is gone once it was replaced.
  await page.reload();
  await settle(page);
  await expectStep(page, 11, "Bookings and price");
  await expect(checkIn).toHaveValue("flex");
  await expect(checkOut).toHaveValue("10:30");
  expect(await checkIn.locator("option").allTextContents()).not.toContain("10:00 AM");

  // Hebrew: 24-hour times and "גמיש".
  await page.goto(`/he/post/${draft.id}?step=11`);
  await settle(page);
  const heIn = page.getByRole("combobox", { name: /^שעת צ׳ק-אין/ });
  await expect(heIn).toHaveValue("flex");
  const heOptions = await heIn.locator("option").allTextContents();
  expect(heOptions.slice(0, 4)).toEqual(["לא נקבע", "גמיש", "12:00", "12:30"]);
  expect(heOptions.at(-1)).toBe("22:00");

  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("the listing page says “Flexible check-in” / “Flexible check-out”", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Flexible Host" });
  const live = await createTestListing({ ownerId: owner.id, title: `E2E Flexible stay ${Date.now().toString(36)}` });
  await sql(`UPDATE "Listing" SET "checkInFrom" = NULL, "checkInFlexible" = true, "checkOutUntil" = '11:00', "checkOutFlexible" = false WHERE id = $1`, [live.id]);
  const { context, page } = await openAs(browser, null);
  await page.goto(`/en/listing/${live.publicId}`);
  await expect(page.getByText("Flexible check-in")).toBeVisible();
  await expect(page.getByText("Check-out by 11:00 AM")).toBeVisible();
  await sql(`UPDATE "Listing" SET "checkOutUntil" = NULL, "checkOutFlexible" = true WHERE id = $1`, [live.id]);
  await page.goto(`/he/listing/${live.publicId}`);
  await expect(page.getByText("צ׳ק-אין גמיש")).toBeVisible();
  await expect(page.getByText("צ׳ק-אאוט גמיש")).toBeVisible();
  await context.close();
});

/** 750 → "12:30 PM" (minutes since midnight, English 12-hour form). */
function clock12(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}
