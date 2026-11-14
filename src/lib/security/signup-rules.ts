/**
 * The fake sign-up numbers (SECURITY_REPORT 3.8.b; founder's answer Q20: "3 accounts per device in
 * 30 days, flag only"). Pure: the guard (./signup-guard.ts), the admin flags page and the tests read
 * them.
 */
export const SIGNUP_DEVICE_ACCOUNT_CAP = 3;
export const SIGNUP_DEVICE_WINDOW_DAYS = 30;
export const SIGNUP_DEVICE_EVENT = "signup_device_cap" as const;
export const DEVICE_FLAG_REVIEWED_ACTION = "flag.signup_device_reviewed";

/** More than the cap: flag (never block). */
export function overSignupDeviceCap(accountsOnDevice: number, cap: number = SIGNUP_DEVICE_ACCOUNT_CAP): boolean {
  return accountsOnDevice > cap;
}
