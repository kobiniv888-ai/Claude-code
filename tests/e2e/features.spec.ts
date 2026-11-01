import type { Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { TEST_EMAIL_DOMAIN, createTestUser, sql } from "./helpers/db";

const VAKE = "Bright 2-bedroom flat in Vake – ready for Shabbat";
const SOLOLAKI = "Kosher apartment in a historic house in Sololaki, ready for Shabbat and Pesach";

const card = (page: Page, title: string) => page.getByRole("list", { name: "Search results" }).getByRole("article", { name: title });

test("favorites and compare", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Saver" });
  const { context, page, consoleErrors } = await openAs(browser, user.phone);
  await page.goto("/en/search?city=tbilisi&deal=short-stay");
  await expect(card(page, VAKE)).toBeVisible();
  await settle(page);

  // Save → listed under Saved.
  await card(page, VAKE).getByRole("button", { name: `Save ${VAKE}` }).click();
  await expect(page.getByText("Saved to your favorites")).toBeVisible();
  await expect(card(page, VAKE).getByRole("button", { name: `Remove ${VAKE} from saved` })).toBeVisible();
  await expect.poll(async () => (await sql(`SELECT 1 FROM "Favorite" WHERE "userId" = $1`, [user.id])).length).toBe(1);

  // Compare two homes.
  await card(page, VAKE).getByRole("button", { name: "Compare" }).click();
  await expect(page.getByText("Added to compare")).toBeVisible();
  await card(page, SOLOLAKI).getByRole("button", { name: "Compare" }).click();
  await page.getByRole("button", { name: "Compare now" }).last().click();
  await expect(page).toHaveURL(/\/en\/account\/compare/);
  const main = page.getByRole("main");
  await expect(main.getByText(VAKE).first()).toBeVisible();
  await expect(main.getByText(SOLOLAKI).first()).toBeVisible();

  await page.goto("/en/account/favorites");
  await expect(page.getByRole("main").getByText(VAKE).first()).toBeVisible();
  await page.getByRole("button", { name: `Remove ${VAKE} from saved` }).first().click();
  await expect.poll(async () => (await sql(`SELECT 1 FROM "Favorite" WHERE "userId" = $1`, [user.id])).length).toBe(0);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("Jewish Life shows the map of places and this week's Shabbat times", async ({ page, consoleErrors }) => {
  await page.goto("/en/jewish-life");
  await expect(page.getByRole("heading", { level: 1, name: "Jewish life in Georgia" })).toBeVisible();
  // Redesign phase 3: the Shabbat section holds the live countdown card (city chips) and the table.
  const shabbat = page.getByRole("region", { name: "Shabbat times in every city" });
  await expect(shabbat.getByRole("article")).toContainText("Candle lighting");
  await expect(shabbat).toContainText("Havdalah");
  await expect(shabbat.locator("time").first()).toHaveText(/\d{1,2}:\d{2}/);
  await expect(shabbat).toContainText("Batumi");

  // The map mounts only when its area comes near the screen (redesign phase 1): scroll there first.
  await page.getByRole("list", { name: "Places" }).scrollIntoViewIfNeeded();
  const map = page.getByRole("region", { name: "Map of Jewish places" });
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator(".leaflet-container")).toBeVisible();
  await expect(map.locator(".leaflet-marker-icon").first()).toBeVisible({ timeout: 45_000 });
  // Filter by type: only synagogues remain in the list.
  await page.getByRole("button", { name: /^Synagogues/ }).click();
  await expect(page.getByRole("list", { name: "Places" }).getByRole("article").first()).toContainText("Synagogue");
  expect(consoleErrors).toEqual([]);
});

test("Help center search filters the questions", async ({ page, consoleErrors }) => {
  await page.goto("/en/help");
  await settle(page);
  const faq = page.getByRole("region", { name: "Frequently asked questions" });
  await expect(faq.getByRole("button", { name: "What is Bayit?" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search the help center" }).fill("photos");
  await expect(page.getByText(/Answers for/)).toBeVisible();
  await expect(page.getByRole("button", { name: "How many photos do I need?" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "What is Bayit?" })).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search the help center" }).fill("zzqxw");
  await expect(page.getByText(/No answers for/)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the contact form creates a support ticket", async ({ page, consoleErrors }) => {
  await page.goto("/en/contact");
  await settle(page);
  const email = `contact-${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
  await page.getByRole("textbox", { name: "Your name" }).fill("E2E Visitor");
  await page.getByRole("textbox", { name: "Your email" }).fill(email);
  await page.getByRole("combobox", { name: "Topic" }).selectOption("TECHNICAL");
  await page.getByRole("textbox", { name: "Your message" }).fill("E2E: the map on the search page does not load on my old phone.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: /^Thank you, E2E/ })).toBeVisible();
  const [ticket] = await sql<{ number: number; status: string; category: string }>(
    `SELECT number, status, category FROM "Ticket" WHERE "guestEmail" = $1`,
    [email],
  );
  expect(ticket?.category).toBe("TECHNICAL");
  await expect(page.getByText(`Your request number is ${ticket.number}.`)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
