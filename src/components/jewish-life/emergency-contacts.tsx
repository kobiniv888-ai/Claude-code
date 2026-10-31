import { ExternalLink, Globe, Landmark, Phone, Siren } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Ltr } from "@/components/common/ltr";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { GEORGIA_EMERGENCY_NUMBER, type EmergencyContact } from "@/lib/jewish-life/emergency";
import { displayUrl, telHref } from "@/lib/jewish-life/places";
import { getEmergencyContacts } from "@/lib/jewish-life/queries";

async function loadContacts(): Promise<EmergencyContact[]> {
  try {
    return await getEmergencyContacts();
  } catch (error) {
    console.error("[jewish-life] could not load emergency contacts:", error);
    return [];
  }
}

/**
 * Emergency and embassy contacts entered by admins (SiteSetting "emergencyContacts").
 * Without any, only Georgia's general emergency number 112 is shown.
 */
export async function EmergencyContacts({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.emergency" });
  const stored = await loadContacts();

  const cards =
    stored.length > 0
      ? stored.map((c) => ({
          label: pickLocalized(c.label, locale),
          description: null as string | null,
          phone: c.phone,
          phoneHref: c.phoneHref,
          url: c.url,
          primary: c.phone?.replace(/\D/g, "") === GEORGIA_EMERGENCY_NUMBER,
        }))
      : [
          {
            label: t("general.title"),
            description: t("general.body"),
            phone: GEORGIA_EMERGENCY_NUMBER,
            phoneHref: telHref(GEORGIA_EMERGENCY_NUMBER),
            url: null,
            primary: true,
          },
        ];

  return (
    <div className="space-y-4">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = card.primary ? Siren : Landmark;
          return (
            <li key={`${card.label}-${index}`}>
              <div
                className={
                  card.primary
                    ? "flex h-full flex-col rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-card"
                    : "flex h-full flex-col rounded-2xl border bg-card p-5 shadow-card"
                }
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={
                      card.primary
                        ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                        : "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                    }
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-balance" dir="auto">
                      {card.label}
                    </h3>
                    {card.description ? (
                      <p className="mt-1 text-sm text-pretty text-muted-foreground">{card.description}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {card.phone && card.phoneHref ? (
                    <a
                      href={card.phoneHref}
                      className={
                        card.primary
                          ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-base font-bold text-white transition-colors hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-destructive-foreground"
                          : "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      }
                    >
                      <Phone aria-hidden="true" className="size-4" />
                      <span className="sr-only">{t("call")}</span>
                      <Ltr>{card.phone}</Ltr>
                    </a>
                  ) : null}
                  {card.url ? (
                    <a
                      href={card.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Globe aria-hidden="true" className="size-4 shrink-0" />
                      <Ltr className="truncate">{displayUrl(card.url)}</Ltr>
                      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
                      <span className="sr-only">{t("opensInNewTab")}</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {stored.length === 0 ? <p className="text-sm text-pretty text-muted-foreground">{t("moreSoon")}</p> : null}
    </div>
  );
}
