import "server-only";
import { AppError } from "@/lib/errors";
import { ACCOUNT_EMAIL_REQUIRED, needsAccountEmail } from "./account-email";

/** An account without a real email tried a sensitive action (founder's answer (5)). */
export class AccountEmailRequiredError extends AppError {
  constructor() {
    super(ACCOUNT_EMAIL_REQUIRED, "Add your email address first", { status: 403 });
  }
}

/**
 * Sensitive actions (a booking, a phone check, the contact email) need an account with a real
 * email first (./account-email.ts). Throws AccountEmailRequiredError → fail("account_email_required").
 */
export function requireAccountEmail(user: { email?: string | null; emailIsPlaceholder?: boolean }): void {
  if (needsAccountEmail(user)) throw new AccountEmailRequiredError();
}
