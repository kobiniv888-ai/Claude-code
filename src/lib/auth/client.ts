"use client";

import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

/**
 * Better Auth in the browser. Same-origin, so no baseURL is needed (/api/auth).
 *
 *   await authClient.phoneNumber.sendOtp({ phoneNumber });
 *   await authClient.phoneNumber.verify({ phoneNumber, code });
 *   await signIn.social({ provider: "google", callbackURL });
 */
export const authClient = createAuthClient({
  plugins: [phoneNumberClient()],
});

export const { useSession, signOut, signIn } = authClient;
