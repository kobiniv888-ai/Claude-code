import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * The "18 or older + Terms" box (SECURITY_REPORT 15.11.b/c): the booking review page and the
 * publish step show it at an account's first booking / first publish (and after a Terms change);
 * the login shows the "terms" step once for a new account. Labels in Hebrew and English.
 */
export const TERMS_BOX_NAME = /בן\/בת 18 ומעלה|18 or older and I accept/;

/** The box on the booking review page or the publish step. */
export const termsBox = (scope: Page | Locator) => scope.getByRole("checkbox", { name: TERMS_BOX_NAME }).filter({ visible: true }).first();

/** Ticks the box (it must be there: the account's first booking or publish). */
export async function acceptTermsBox(scope: Page | Locator) {
  const box = termsBox(scope);
  await expect(box).toBeVisible({ timeout: 15_000 });
  await box.check();
}

/** Ticks the box when the page shows it (a later booking of the same account does not). */
export async function acceptTermsBoxIfShown(scope: Page | Locator) {
  const box = termsBox(scope);
  await box.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await box.isVisible()) await box.check();
}

/** A new account's login "terms" step: tick and continue. */
export async function answerTermsStep(scope: Page | Locator) {
  const box = scope.getByRole("checkbox", { name: TERMS_BOX_NAME });
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.check();
  await scope.getByRole("button", { name: /^(המשך|Continue)$/ }).click();
}
