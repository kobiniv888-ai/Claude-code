/**
 * Which subtitle the login sheet and /login show, so it never promises a way in that is not
 * offered (e.g. "we'll email you a code" while email login is not set up). Pure, client-safe.
 */
export type LoginSubtitleKey = "dialogSubtitle" | "dialogSubtitleNoSocial" | "dialogSubtitleSocialOnly" | "dialogSubtitleUnavailable";

export function loginSubtitleKey(config: { providers: { google: boolean; apple: boolean }; email: { available: boolean } }): LoginSubtitleKey {
  const social = config.providers.google || config.providers.apple;
  if (social) return config.email.available ? "dialogSubtitle" : "dialogSubtitleSocialOnly";
  return config.email.available ? "dialogSubtitleNoSocial" : "dialogSubtitleUnavailable";
}
