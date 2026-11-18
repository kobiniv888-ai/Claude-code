import { expect, openAs, settle, test } from "./fixtures";
import { loginByEmail } from "./helpers/auth";
import { sql } from "./helpers/db";
import { TEST_ADMIN_PHONE } from "./helpers/staff";

/**
 * Brief section 13, test 3 (round 3, brief 8.2): the demo guest sends a "turned away" report from
 * the "…" menu of a listing (phone layout, Hebrew), sees the confirmation, and the report waits at
 * the top of the admin queue as urgent, for the test admin (real 2-step login). The guest signs in
 * with an email code (the phone-code limit is shared by the whole run). The report, its emails and
 * its rate-limit window are removed afterwards; the demo data is left as it was.
 */

const GUEST = { id: "demo-user-guest", email: "guest@demo.bayit.example" };
/** A demo short stay of another demo host (Rivka), with the booking bar and its "…" menu. */
const LISTING_PUBLIC_ID = 108;
/** A 1×1 PNG. */
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const DETAILS = `E2E turned away ${Date.now().toString(36)}: the host asked where my family is from.`;

async function removeTestReports() {
  const rows = await sql<{ id: string }>(`SELECT id FROM "Report" WHERE "reporterId" = $1 AND details LIKE 'E2E %'`, [GUEST.id]);
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await sql(`DELETE FROM "AuditLog" WHERE "targetId" = ANY($1)`, [ids]);
    // The founder's email names the report's page; the guest's confirmation goes to the guest.
    await sql(`DELETE FROM "EmailOutbox" WHERE template = 'report_admin' AND EXISTS (SELECT 1 FROM unnest($1::text[]) r WHERE html LIKE '%' || r || '%')`, [ids]);
    await sql(`DELETE FROM "Report" WHERE id = ANY($1)`, [ids]);
  }
  await sql(`DELETE FROM "EmailOutbox" WHERE template = 'report_received' AND "to" = $1`, [GUEST.email]);
  // The guest's sign-in code (email, below): codes expire within minutes, so none is kept.
  await sql(`DELETE FROM "EmailOutbox" WHERE template = 'login_code' AND "to" = $1`, [GUEST.email]);
  await sql(`DELETE FROM "RateLimit" WHERE key = $1`, [`report:${GUEST.id}`]);
}

test.describe("turned-away report", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "he-IL" });
  test.beforeAll(removeTestReports);
  test.afterAll(removeTestReports);

  test("the demo guest reports the host from the listing menu, and it waits in the admin queue as urgent", async ({ page, browser, consoleErrors }) => {
    // On the development server its overlay button sits over the phone's bottom bar (errors are
    // still collected): hide it, so the test also runs there. Production has no overlay.
    await page.addInitScript(() => {
      const hide = () => document.head.appendChild(Object.assign(document.createElement("style"), { textContent: "nextjs-portal{display:none!important}" }));
      if (document.head) hide();
      else document.addEventListener("DOMContentLoaded", hide);
    });
    await loginByEmail(page, GUEST.email);
    await page.goto(`/he/listing/${LISTING_PUBLIC_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await settle(page);

    await page.getByRole("button", { name: "עוד אפשרויות" }).click();
    await page.getByRole("menuitem", { name: "דיווח על המארח" }).click();
    const sheet = page.getByRole("dialog", { name: "דיווח על המארח" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("המארח לא יודע מי דיווח", { exact: false }).first()).toBeVisible();
    // Nothing chosen yet, scrolled down to the screenshots: the form says what is missing and
    // takes the guest there (focus on the first choice, scrolled into view).
    await sheet.locator("form").evaluate((form) => {
      const body = form.parentElement; // the sheet's scrolling body
      if (body) body.scrollTop = body.scrollHeight;
    });
    await sheet.getByRole("button", { name: "שליחת הדיווח" }).click();
    await expect(sheet.getByRole("alert")).toHaveText("נא לבחור מה קרה.");
    const firstReason = sheet.getByRole("radio").first();
    await expect(firstReason).toBeFocused();
    await expect(firstReason).toBeInViewport();
    await sheet.getByRole("radio", { name: "המארח שאל על הדת שלי או מאיפה אני" }).click();
    // The day in the page's language (never a device-formatted "11/03/2026"), picked from the
    // site's calendar.
    const dateButton = sheet.getByRole("button", { name: /^מתי זה קרה\?/ });
    await expect(dateButton).toHaveText(/^\d{1,2} ב\S+ \d{4}$/);
    const shownDay = await dateButton.textContent();
    await dateButton.click();
    const calendar = sheet.getByRole("grid");
    await expect(calendar).toBeVisible();
    await calendar.locator("td:not([data-selected]) button:enabled").first().click();
    await expect(calendar).toBeHidden();
    await expect(dateButton).toBeFocused();
    await expect(dateButton).not.toHaveText(shownDay ?? "");
    await expect(dateButton).toHaveText(/^\d{1,2} ב\S+ \d{4}$/);

    // Five screenshots (the uploads answered here, so nothing is stored): removing one of the five
    // leaves keyboard focus on "Add screenshots", not at the top of the sheet.
    await page.route("**/api/uploads/private**", (route) =>
      route.fulfill({ status: 201, json: { key: `private/report/${GUEST.id}/e2e${Date.now()}.jpg`, mime: "image/jpeg", bytes: 68, name: "shot.jpg" } }),
    );
    const addShots = sheet.getByLabel("הוספת צילומי מסך");
    await addShots.setInputFiles(Array.from({ length: 5 }, (_, i) => ({ name: `shot-${i + 1}.png`, mimeType: "image/png", buffer: Buffer.from(PNG_1PX, "base64") })));
    await expect(sheet.getByText("5 מתוך 5")).toBeVisible();
    await expect(addShots).toBeDisabled();
    await sheet.getByRole("button", { name: "הסרת צילום מסך 3" }).focus();
    await page.keyboard.press("Enter");
    await expect(sheet.getByText("4 מתוך 5")).toBeVisible();
    await expect(addShots).toBeFocused();
    // None of them goes with the report (their keys are made up).
    for (let left = 4; left > 0; left--) await sheet.getByRole("button", { name: "הסרת צילום מסך 1" }).click();
    await expect(sheet.getByText("0 מתוך 5")).toBeVisible();
    await page.unroute("**/api/uploads/private**");
    await sheet.getByRole("textbox", { name: /במילים שלכם/ }).fill(DETAILS);
    await sheet.getByRole("button", { name: "שליחת הדיווח" }).click();
    await expect(page.getByRole("dialog", { name: "תודה שסיפרתם לנו" })).toBeVisible();
    await expect(page.getByText("המארח לא יודע שדיווחתם.")).toBeVisible();
    // The send button became "Close": focus is on it, not lost to the sheet.
    await expect(page.getByRole("dialog", { name: "תודה שסיפרתם לנו" }).getByRole("button").filter({ hasText: "סגירה" })).toBeFocused();

    // Saved as urgent and about the host; nothing was hidden.
    const [report] = await sql<{ id: string; kind: string; priority: string; status: string; targetType: string; targetUserId: string; listingStatus: string }>(
      `SELECT r.id, r.kind, r.priority, r.status, r."targetType", r."targetUserId", l.status AS "listingStatus"
         FROM "Report" r JOIN "Listing" l ON l.id = r."listingId" WHERE r.details = $1`,
      [DETAILS],
    );
    expect(report).toMatchObject({ kind: "TURNED_AWAY", priority: "URGENT", status: "OPEN", targetType: "USER", listingStatus: "LIVE" });
    // The founder's email (after the answer) links to the report.
    await expect
      .poll(async () => (await sql(`SELECT 1 FROM "EmailOutbox" WHERE template = 'report_admin' AND html LIKE $1`, [`%/admin/reports/${report.id}%`])).length)
      .toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);

    // The admin queue (all open reports): urgent first, with the guest's words.
    const admin = await openAs(browser, TEST_ADMIN_PHONE);
    await admin.page.goto("/en/admin/reports");
    const queue = admin.page.locator("ul", { has: admin.page.getByText(DETAILS) });
    await expect(queue.locator(":scope > li").first().getByText("Urgent")).toBeVisible();
    // The turned-away tab has it too.
    await admin.page.getByRole("link", { name: /^Turned away/ }).click();
    await admin.page.waitForURL(/tab=turnedAway/);
    const row = admin.page.getByRole("listitem").filter({ hasText: DETAILS });
    await expect(row).toBeVisible();
    await expect(row.getByText("Urgent")).toBeVisible();
    await expect(row.getByText("Turned away:")).toBeVisible();
    await row.getByRole("link", { name: "Host asked about religion or origin" }).click();
    await expect(admin.page.getByRole("heading", { level: 1, name: "Host asked about religion or origin" })).toBeVisible();
    await expect(admin.page.getByText(DETAILS)).toBeVisible();
    await expect(admin.page.getByText("The host doesn't know who reported. Only you can decide to tell them.")).toBeVisible();
    await expect(admin.page.getByRole("button", { name: "Warn the host" })).toBeVisible();
    await expect(admin.page.getByRole("button", { name: "Tell the host who reported" })).toBeVisible();
    expect(admin.consoleErrors).toEqual([]);
    await admin.context.close();
  });
});
