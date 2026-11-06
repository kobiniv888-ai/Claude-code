import { expect, openAs, settle, test } from "./fixtures";
import { TEST_ADMIN_PHONE } from "./helpers/staff";
import { createReport, createTestListing, createTestUser, listingByPublicId, sql } from "./helpers/db";

/** Definition of done: report buttons, safety tips and the automatic scam checks all work. */

test("the Report dialog sends a report, and enough reports hide the listing", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Report target ${Date.now().toString(36)}` });
  // Two other visitors already reported it; the setting hides a listing at 3 open reports.
  for (const reason of ["FAKE_LISTING", "WRONG_PRICE"]) {
    const reporter = await createTestUser();
    await createReport({ listingId: listing.id, reporterId: reporter.id, reason });
  }
  expect((await listingByPublicId(listing.publicId)).status).toBe("LIVE");

  const reporter = await createTestUser();
  const { context, page, consoleErrors } = await openAs(browser, reporter.phone);
  await page.goto(`/en/listing/${listing.publicId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Report target");
  await settle(page);
  await page.getByRole("button", { name: "Report listing" }).click();
  const dialog = page.getByRole("dialog", { name: "Report listing" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "Asked for money up front" }).click();
  await dialog.getByRole("textbox").fill("The owner asked me to send a deposit by Western Union before the viewing.");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByText("Your report was sent. A moderator will check it soon.")).toBeVisible();

  // Third open report → hidden until a moderator checks it.
  await expect.poll(async () => (await listingByPublicId(listing.publicId)).status).toBe("HIDDEN");
  const visitor = await openAs(browser, null);
  await visitor.page.goto(`/en/listing/${listing.publicId}`);
  await expect(visitor.page.getByRole("heading", { level: 1, name: "This listing is not available" })).toBeVisible();
  await visitor.context.close();

  // The reporter sees it is gone too.
  await page.reload();
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: "This listing is not available" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("a phone number in the description stops publishing; scam phrases send a listing to review with those reasons", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Risky Owner" });
  // Publishing needs the Bayit pledge (redesign phase 1); this owner accepted version 1 earlier.
  await sql(`UPDATE "User" SET "welcomePledgeVersion" = 1, "welcomePledgeAcceptedAt" = now() WHERE id = $1`, [owner.id]);
  // Not the owner's first listing, so the review is caused by the checks themselves.
  await createTestListing({ ownerId: owner.id, title: `E2E Earlier flat ${Date.now().toString(36)}` });
  const title = `E2E Risky flat ${Date.now().toString(36)}`;
  const scamText = "Cozy flat with a mountain view. I am abroad right now, so please send the deposit by Western Union first and I will post you the keys.";
  const draft = await createTestListing({ ownerId: owner.id, title, status: "DRAFT", description: `${scamText} WhatsApp me: +995 599 12 34 56.` });

  const { context, page, consoleErrors } = await openAs(browser, owner.phone);
  // By key: the preview's position depends on the steps (the pledge, the split details step…).
  await page.goto(`/en/post/${draft.id}?step=publish`);
  await expect(page.getByRole("heading", { level: 1, name: "Preview and publish" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Before you can publish" })).toHaveCount(0);
  await settle(page);
  // Round 3 (brief 6.1): a phone number in the description is an error of the mistake check, and
  // "Publish" is refused while it is there.
  const panel = page.getByTestId("mistake-check");
  await expect(panel.locator('[data-mistake="contact_in_description"]')).toBeVisible();
  await page.getByRole("checkbox", { name: /I accept the listing rules/ }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click(); // the bottom bar (bug 2.7)
  await expect(panel.getByRole("heading", { name: "Check before publishing" })).toBeFocused();
  expect((await listingByPublicId(draft.publicId)).status).toBe("DRAFT");

  // Without the phone number it publishes, and the scam phrases send it to review.
  await sql(`UPDATE "Listing" SET description = $2, "contentUpdatedAt" = now() WHERE id = $1`, [draft.id, scamText]);
  await panel.getByRole("button", { name: "Check again" }).click();
  await expect(panel.locator('[data-mistake="contact_in_description"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "We're checking your listing" })).toBeVisible({ timeout: 60_000 });
  expect(consoleErrors).toEqual([]);
  await context.close();

  const listing = await listingByPublicId(draft.publicId);
  expect(listing.status).toBe("IN_REVIEW");
  expect(listing.riskScore ?? 0).toBeGreaterThanOrEqual(30);
  const codes = (listing.riskReasons ?? []).map((r) => r.code);
  expect(codes).toContain("scam_phrase");
  expect(codes).not.toContain("first_listing");
  const scam = listing.riskReasons!.find((r) => r.code === "scam_phrase")!;
  expect(scam.detail?.toLowerCase()).toContain("western union");

  // The moderator sees the score and the reasons.
  const admin = await openAs(browser, TEST_ADMIN_PHONE);
  await admin.page.goto(`/en/admin/moderation/${listing.id}`);
  const risk = admin.page.getByRole("region", { name: "Automatic risk check" }).or(admin.page.locator("section", { has: admin.page.getByRole("heading", { name: "Automatic risk check" }) }));
  await expect(risk.first()).toContainText("Scam phrases");
  expect(admin.consoleErrors).toEqual([]);
  await admin.context.close();
});
