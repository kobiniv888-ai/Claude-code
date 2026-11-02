"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient, phoneNumberClient } from "better-auth/client/plugins";

/**
 * Better Auth in the browser. Same-origin, so no baseURL is needed (/api/auth).
 *
 *   await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
 *   await authClient.signIn.emailOtp({ email, otp });
 *   await authClient.phoneNumber.sendOtp({ phoneNumber });      // development / test mode only
 *   await authClient.phoneNumber.verify({ phoneNumber, code });  // development / test mode only
 *   await signIn.social({ provider: "google", callbackURL });
 *
 * A signed-in account verifies a phone number (booking, posting) with the server actions in
 * ./phone-check-actions.ts instead (<PhoneCheck>).
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), phoneNumberClient()],
});

export const { useSession, signOut, signIn } = authClient;
