import { expect, openAs, settle, test } from "./fixtures";
import { DEMO } from "./helpers/auth";
import { createReport, createTestListing, createTestUser, createTicket, sql } from "./helpers/db";

/** Definition of done: an admin can handle reports and answer tickets. */

test("an admin resolves a report", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Reported flat ${Date.now().toString(36)}` });
  const reporter = await createTestUser();
  const reportId = await createReport({ listingId: listing.id, reporterId: reporter.id, reason: "WRONG_PRICE", details: "E2E: the price on the phone was higher." });

  const { context, page, consoleErrors } = await openAs(browser, DEMO.admin);
  await page.goto("/en/admin/reports");
  await page.getByRole("link", { name: "Wrong price" }).and(page.locator(`[href$="/admin/reports/${reportId}"]`)).click();
  await expect(page.getByRole("heading", { level: 1, name: "Wrong price" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("E2E: the price on the phone was higher.");
  await settle(page);
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Resolve this report" });
  await dialog.getByRole("textbox", { name: "Resolution note" }).fill("E2E: asked the owner to fix the price.");
  await dialog.getByRole("button", { name: "Mark as resolved" }).click();
  await expect(page.getByText("The report was resolved.")).toBeVisible();
  await expect.poll(async () => (await sql<{ status: string }>(`SELECT status FROM "Report" WHERE id = $1`, [reportId]))[0].status).toBe("RESOLVED");
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("an admin answers a ticket and the user reads the reply", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Ticket User" });
  const ticket = await createTicket({ userId: user.id, subject: `E2E Photos do not upload ${Date.now().toString(36)}`, body: "E2E: my photos stop at 90%." });

  const admin = await openAs(browser, DEMO.admin);
  await admin.page.goto(`/en/admin/tickets/${ticket.id}`);
  await expect(admin.page.getByRole("heading", { level: 1 })).toContainText("E2E Photos do not upload");
  await settle(admin.page);
  const reply = `E2E reply ${Date.now().toString(36)}: please try again with a smaller photo.`;
  await admin.page.getByRole("textbox", { name: "Reply to the user" }).fill(reply);
  await admin.page.getByRole("button", { name: "Send reply" }).click();
  await expect
    .poll(async () => (await sql(`SELECT 1 FROM "TicketMessage" WHERE "ticketId" = $1 AND "fromStaff" AND body = $2`, [ticket.id, reply])).length)
    .toBe(1);
  expect(admin.consoleErrors).toEqual([]);
  await admin.context.close();

  const { context, page, consoleErrors } = await openAs(browser, user.phone);
  await page.goto(`/en/account/tickets/${ticket.number}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Photos do not upload");
  await expect(page.getByText(reply)).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("an admin rejects a listing", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Rejected flat ${Date.now().toString(36)}`, status: "IN_REVIEW" });

  const { context, page, consoleErrors } = await openAs(browser, DEMO.admin);
  await page.goto(`/en/admin/moderation/${listing.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Rejected flat");
  await settle(page);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject this listing?" }).or(page.getByRole("alertdialog", { name: "Reject this listing?" }));
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "Suspected scam" }).click();
  await dialog.getByRole("button", { name: "Reject listing" }).click();
  await expect(page.getByText("The listing was rejected.")).toBeVisible();
  await expect.poll(async () => (await sql<{ status: string }>(`SELECT status FROM "Listing" WHERE id = $1`, [listing.id]))[0].status).toBe("REJECTED");
  expect(consoleErrors).toEqual([]);
  await context.close();
});
