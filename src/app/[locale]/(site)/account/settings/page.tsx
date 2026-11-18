import type { Metadata } from "next";
import { headers } from "next/headers";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  ConnectedAccounts,
  ContactEmailForm,
  DataExport,
  DeleteAccount,
  NotificationsForm,
  PreferencesForm,
  ProfileForm,
  SettingsSection,
} from "@/components/account/settings-forms";
import { BookingAlerts } from "@/components/account/booking-alerts";
import { LogoutEverywhere } from "@/components/account/logout-everywhere";
import { AccountEmailStep } from "@/components/auth/account-email-step";
import { DeletionKeeps } from "@/components/legal/deletion-keeps";
import { TwoFactorSettings } from "@/components/auth/two-factor-settings";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { getAccountSettings } from "@/lib/account/queries";
import { getBookingAlertSettings } from "@/lib/alerts/settings";
import { hasHostListings } from "@/lib/listing/stats";
import { SPOKEN_LANGUAGE_OPTIONS } from "@/lib/account/settings-schema";
import { recoveryCodesLeft } from "@/lib/auth/recovery-codes";
import { requireUser } from "@/lib/auth/session";
import { languageName } from "@/lib/listing-page/helpers";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: "/account/settings", title: t("settings"), description: t("description"), noIndex: true });
}

/** /account/settings — profile, contact email, language & currency, notifications, booking alerts (hosts), security and privacy. */
export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser({ next: "/account/settings" });
  const t = await getTranslations("account.settings");
  const [data, alerts, tAlerts, format, isHost, codesLeft] = await Promise.all([
    getAccountSettings(user.id),
    // Booking alerts (round 3): shown to hosts of short stays and hotels.
    headers().then((h) => getBookingAlertSettings(user.id, h)),
    getTranslations("alerts"),
    getFormatter(),
    // The weekly stats email switch (round 3, brief 6.2) is for accounts with listings.
    hasHostListings(user.id),
    // 2-step recovery codes still unused (SECURITY_REPORT 3.7.c).
    user.twoFactorEnabled ? recoveryCodesLeft(user.id) : Promise.resolve(0),
  ]);
  // "email and Telegram", formatted here so the browser's language data can't change it.
  const alertChannelsText =
    alerts && alerts.gate.ok ? format.list(alerts.gate.channels.map((c) => tAlerts(`channelShort.${c}`)), { type: "conjunction" }) : null;
  // Named here: browsers without Georgian Intl data would name them in English and break hydration.
  const languageNames = Object.fromEntries(
    [...new Set([...SPOKEN_LANGUAGE_OPTIONS, ...data.spokenLanguages])].map((code) => [code, languageName(code, locale)]),
  );

  return (
    <div className="grid gap-4 sm:gap-6">
      <PageHeader title={t("title")} description={t("lead")} className="pb-0 sm:pb-0" />

      <SettingsSection id="profile" title={t("profile.title")} lead={t("profile.lead")}>
        <ProfileForm data={data} languageNames={languageNames} />
      </SettingsSection>

      <SettingsSection
        id="email"
        title={t("email.title")}
        lead={
          data.phoneNumber ? (
            <>
              {t("email.lead")} <Ltr>{data.phoneNumber}</Ltr>
            </>
          ) : (
            t("email.leadNoPhone")
          )
        }
      >
        {/* Founder's answer (5): an account without a real email adds one (its login email) first. */}
        {user.emailIsPlaceholder ? <AccountEmailStep /> : <ContactEmailForm loginEmail={data.loginEmail} contactEmail={data.contactEmail} />}
      </SettingsSection>

      <SettingsSection id="preferences" title={t("preferences.title")} lead={t("preferences.lead")}>
        <PreferencesForm data={data} />
      </SettingsSection>

      <SettingsSection id="notifications" title={t("notifications.title")} lead={t("notifications.lead")}>
        <NotificationsForm prefs={data.notifications} emailAvailable={!!(data.contactEmail || data.loginEmail)} isHost={isHost} />
      </SettingsSection>

      {alerts?.show ? (
        <SettingsSection id="booking-alerts" title={tAlerts("settings.title")} lead={tAlerts("settings.lead")}>
          <BookingAlerts data={alerts} channelsText={alertChannelsText} />
        </SettingsSection>
      ) : null}

      <div id="security" className="grid scroll-mt-24 gap-4 sm:gap-6">
        <TwoFactorSettings
          enabled={data.twoFactorEnabled}
          isStaff={user.isStaff}
          recoveryCodesLeft={codesLeft}
          // Hotels, guesthouses and agencies: recommended strongly (SECURITY_REPORT 3.7.b).
          recommend={user.accountType === "BUSINESS"}
          returnTo="/account/settings#security"
        />
        <SettingsSection id="logout-all" title={t("logoutAll.title")} lead={t("logoutAll.lead")}>
          <LogoutEverywhere />
        </SettingsSection>
      </div>

      {data.providers.length > 0 ? (
        <SettingsSection id="connected" title={t("connected.title")} lead={t("connected.lead")}>
          <ConnectedAccounts data={data} />
        </SettingsSection>
      ) : null}

      <SettingsSection id="data" title={t("data.title")} lead={t("data.lead")}>
        <DataExport />
      </SettingsSection>

      <SettingsSection id="delete" title={t("delete.title")} lead={t("delete.lead")} tone="danger">
        <DeleteAccount isStaff={user.isStaff} />
        {/* SECURITY_REPORT 15.8.b: what stays after a deletion, and for how long. */}
        {user.isStaff ? null : <DeletionKeeps />}
      </SettingsSection>
    </div>
  );
}
