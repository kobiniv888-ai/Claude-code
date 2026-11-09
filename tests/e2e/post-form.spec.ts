import type { Locator, Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { createTestUser, sql } from "./helpers/db";
import { openAddress } from "./helpers/field-crypto";
import { makePhotos } from "./helpers/photos";

/**
 * Brief 13.1 (round 3, bug 2.2): fill in every step of the post form, go back to step 1 and
 * forward again, and reload in the middle: nothing is lost. The founder's listing 44 lost its
 * place type and city when he went back from step 11, so every step is checked on the way back
 * (the form's Back button and the browser's Back button) and again on the way forward.
 */

const TITLE = `E2E Round trip flat ${Date.now().toString(36)}`;
const DESCRIPTION = "A bright flat with a mountain view, a full kitchen and a balcony. Ten minutes on foot to the center of Mestia.";
const ADDRESS = "E2E Street 7, entrance 2, apartment 5";

/** Radio and checkbox cards hide the native input under a styled label. */
async function choose(input: Locator) {
  await input.locator("xpath=ancestor::label[1]").click();
  await expect(input).toBeChecked();
}

async function expectStep(page: Page, step: number, heading: string) {
  await expect(page).toHaveURL(new RegExp(`[?&]step=${step}(&|$)`));
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  // The step's saved answers are loaded (the step is read-only and Next waits until then).
  await expect(page.getByText("Loading your saved answers…")).toHaveCount(0);
}

const nextButton = (page: Page) => page.getByRole("button", { name: "Next", exact: true });
const backButton = (page: Page) => page.getByRole("button", { name: "Back", exact: true });
const stepperValue = (page: Page, label: RegExp) => page.getByRole("group", { name: label }).locator("output");

/** What each step must still show; checked on the way back and on the way forward. */
const CHECKS: Record<number, { heading: string; check: (page: Page) => Promise<void> }> = {
  1: { heading: "What would you like to list?", check: async (page) => expect(page.getByRole("radio", { name: /^Short stay/ })).toBeChecked() },
  2: { heading: "What kind of place is it?", check: async (page) => expect(page.getByRole("radio", { name: /^Apartment/ })).toBeChecked() },
  3: {
    heading: "Where is it?",
    check: async (page) => {
      await expect(page.getByRole("combobox", { name: "City" })).toContainText("Mestia");
      await expect(page.getByRole("textbox", { name: /^Exact address/ })).toHaveValue(ADDRESS);
      await expect(page.getByText("Pin set at")).toBeVisible();
    },
  },
  4: {
    heading: "Size and rooms",
    check: async (page) => {
      await expect(stepperValue(page, /^Bedrooms/)).toHaveText("2");
      await expect(page.getByRole("textbox", { name: /^Size/ })).toHaveValue("48");
    },
  },
  5: {
    heading: "The building",
    check: async (page) => {
      await expect(page.getByRole("textbox", { name: /^Floor/ }).first()).toHaveValue("3");
      await expect(page.getByRole("group", { name: "Elevator" }).getByRole("radio", { name: "Yes" })).toBeChecked();
    },
  },
  6: { heading: "Condition and features", check: async (page) => expect(page.getByRole("button", { name: /Heating/ })).toContainText("1 selected") },
  7: {
    heading: "Title and description",
    check: async (page) => {
      await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(TITLE);
      await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue(DESCRIPTION);
    },
  },
  8: { heading: "What does the place offer?", check: async (page) => expect(page.getByRole("checkbox", { name: "Wi-Fi" })).toBeChecked() },
  9: {
    heading: "Jewish-friendly details",
    check: async (page) => {
      await expect(page.getByRole("radio", { name: /^Kosher \(separate meat and dairy\)/ })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: /^Hot plate/ })).toBeChecked();
    },
  },
  10: { heading: "Add photos", check: async (page) => expect(page.getByText(/^6 photos/)).toBeVisible() },
  11: {
    heading: "Bookings and price",
    check: async (page) => {
      await expect(page.getByRole("textbox", { name: "Price per night", exact: true })).toHaveValue("95");
      await expect(stepperValue(page, /^Maximum guests/)).toHaveText("2");
      await expect(page.getByRole("checkbox", { name: "Cash" })).toBeChecked();
    },
  },
  12: { heading: "How should guests contact you?", check: async (page) => expect(page.getByRole("textbox", { name: "WhatsApp number" })).not.toHaveValue("") },
  13: { heading: "The Bayit pledge", check: async (page) => expect(page.getByText("You accepted the Bayit pledge")).toBeVisible() },
  14: {
    heading: "Preview and publish",
    check: async (page) => {
      await expect(page.getByRole("region", { name: "Before you can publish" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
    },
  },
};

async function checkStep(page: Page, step: number) {
  await expectStep(page, step, CHECKS[step].heading);
  await CHECKS[step].check(page);
}

test("post form: every step filled, back to step 1 and forward again, a reload in the middle — nothing is lost", async ({ browser }) => {
  test.slow();
  const owner = await createTestUser({ name: "E2E Poster" });
  await sql(`UPDATE "User" SET "firstName" = 'Dana' WHERE id = $1`, [owner.id]);
  const { context, page, consoleErrors } = await openAs(browser, owner.phone);

  await page.goto("/en/post");
  await page.getByRole("button", { name: "Start a new listing" }).first().click();
  await expect(page).toHaveURL(/\/en\/post\/[^/?]+\?step=1/);
  const draftPath = new URL(page.url()).pathname;
  await settle(page);

  // ── Forward: fill in every step ──
  await expectStep(page, 1, CHECKS[1].heading);
  await choose(page.getByRole("radio", { name: /^Short stay/ }));
  await nextButton(page).click();

  await expectStep(page, 2, CHECKS[2].heading);
  await choose(page.getByRole("radio", { name: /^Apartment/ }));
  await nextButton(page).click();

  await expectStep(page, 3, CHECKS[3].heading);
  await page.getByRole("combobox", { name: "City" }).click();
  await page.getByRole("option", { name: "Mestia" }).click();
  const map = page.getByRole("region", { name: "Map for choosing the exact location" });
  await expect(map).toBeVisible();
  await settle(page);
  await map.click({ position: { x: 200, y: 150 } });
  await expect(page.getByText("Pin set at")).toBeVisible();
  await page.getByRole("textbox", { name: /^Exact address/ }).fill(ADDRESS);
  await nextButton(page).click();

  await expectStep(page, 4, CHECKS[4].heading);
  await page.getByRole("button", { name: "More: Bedrooms" }).click();
  await page.getByRole("button", { name: "More: Bedrooms" }).click();
  await page.getByRole("textbox", { name: /^Size/ }).fill("48");
  await nextButton(page).click();

  await expectStep(page, 5, CHECKS[5].heading);
  await page.getByRole("textbox", { name: /^Floor/ }).first().fill("3");
  await page.getByRole("group", { name: "Elevator" }).getByText("Yes", { exact: true }).click();
  await nextButton(page).click();

  await expectStep(page, 6, CHECKS[6].heading);
  await page.getByRole("button", { name: /Heating/ }).click();
  await choose(page.getByRole("checkbox", { name: "Gas boiler" }));
  await nextButton(page).click();

  await expectStep(page, 7, CHECKS[7].heading);
  await page.getByRole("textbox", { name: "Title" }).fill(TITLE);
  await page.getByRole("textbox", { name: "Description" }).fill(DESCRIPTION);
  await nextButton(page).click();

  await expectStep(page, 8, CHECKS[8].heading);
  await choose(page.getByRole("checkbox", { name: "Wi-Fi" }));
  await nextButton(page).click();

  await expectStep(page, 9, CHECKS[9].heading);
  await choose(page.getByRole("radio", { name: /^Kosher \(separate meat and dairy\)/ }));
  await choose(page.getByRole("checkbox", { name: /^Hot plate/ }));
  await nextButton(page).click();

  await expectStep(page, 10, CHECKS[10].heading);
  await page.locator('input[type="file"]').setInputFiles(await makePhotos(6));
  await expect(page.getByText("Enough photos to publish")).toBeVisible({ timeout: 90_000 });
  await nextButton(page).click();

  await expectStep(page, 11, CHECKS[11].heading);
  await page.getByRole("textbox", { name: "Price per night", exact: true }).fill("95");
  await page.getByRole("button", { name: "More: Maximum guests" }).click();
  await page.getByRole("button", { name: "More: Maximum guests" }).click();
  await choose(page.getByRole("checkbox", { name: "Cash" }));
  await nextButton(page).click();

  await expectStep(page, 12, CHECKS[12].heading);
  await CHECKS[12].check(page);
  await nextButton(page).click();

  await expectStep(page, 13, CHECKS[13].heading);
  await page.getByRole("checkbox", { name: "I have read this and I commit to it" }).check();
  await page.getByRole("button", { name: "Accept the pledge" }).click();
  await expect(page.getByText("You accepted the Bayit pledge")).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await checkStep(page, 14);

  // ── Back to step 1 with the form's Back button: every step shows its answers ──
  for (let step = 13; step >= 1; step -= 1) {
    await backButton(page).click();
    await checkStep(page, step);
  }

  // ── Forward again, with the browser's Back button once and a reload in the middle ──
  for (let step = 2; step <= 13; step += 1) {
    await nextButton(page).click();
    await checkStep(page, step);
    if (step === 4) {
      // The browser's Back button (the founder's bug): step 3 with its answers, then on again.
      await page.goBack();
      await checkStep(page, 3);
      await nextButton(page).click();
      await checkStep(page, 4);
    }
    if (step === 7) {
      await page.reload();
      await settle(page);
      await checkStep(page, 7);
    }
  }
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await checkStep(page, 14);

  // The answers are in the database too (the draft card in "My places" reads them).
  const [row] = await sql<{ title: string; address: string | null; addressEnc: string | null; dealType: string; propertyType: string; price: string; city: string }>(
    `SELECT l.title, l.address, l."addressEnc", l."dealType", l."propertyType", l.price::text AS price, c.slug AS city
       FROM "Listing" l JOIN "City" c ON c.id = l."cityId" WHERE l.title = $1`,
    [TITLE],
  );
  expect(row).toMatchObject({ title: TITLE, dealType: "SHORT_STAY", propertyType: "APARTMENT", city: "mestia" });
  // The exact address is stored encrypted only (SECURITY_REPORT 12.3.c): never in the plain column.
  expect(row.address).toBeNull();
  expect(row.addressEnc).toMatch(/^fe1:/);
  expect(openAddress(row.addressEnc)).toBe(ADDRESS);
  expect(Number(row.price)).toBe(95);
  expect(new URL(page.url()).pathname).toBe(draftPath);
  expect(consoleErrors).toEqual([]);
  await context.close();
});
