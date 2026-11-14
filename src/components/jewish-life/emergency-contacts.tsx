import { ExternalLink, Globe, Landmark, Phone, Siren } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Ltr } from "@/components/common/ltr";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { GEORGIA_EMERGENCY_NUMBER, type EmergencyContact } from "@/lib/jewish-life/emergency";
import { displayUrl, telHref } from "@/lib/jewish-life/places";
import { getEmergencyContacts } from "@/lib/jewish-life/queries";
import { cn } from "@/lib/utils";

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
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = card.primary ? Siren : Landmark;
          return (
            <li key={`${card.label}-${index}`} className={card.primary && cards.length === 1 ? "sm:col-span-2 lg:col-span-2" : undefined}>
              <div
                className={cn(
                  "flex h-full flex-col overflow-hidden rounded-card shadow-card",
                  card.primary ? "bg-destructive/8 ring-1 ring-destructive/25" : "bg-card ring-1 ring-foreground/5",
                )}
              >
                {card.phone && card.phoneHref ? (
                  // The whole card calls: a big target with the number written out.
                  <a
                    href={card.phoneHref}
                    aria-label={t("callLabel", { name: card.label, number: card.phone })}
                    className="group flex flex-1 items-center gap-4 p-4 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/60 sm:p-5"
                  >
                    <CardText card={card} icon={Icon} />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-12 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform duration-(--motion-fast) group-hover:scale-105 motion-reduce:transition-none",
                        card.primary ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
                      )}
                    >
                      <Phone className="size-5" />
                    </span>
                  </a>
                ) : (
                  <div className="flex flex-1 items-center gap-4 p-4 sm:p-5">
                    <CardText card={card} icon={Icon} />
                  </div>
                )}
                {card.url ? (
                  <a
                    href={card.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 min-w-0 items-center gap-2 border-t px-4 py-2.5 text-small font-semibold text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-5"
                  >
                    <Globe aria-hidden="true" className="size-4 shrink-0" />
                    <Ltr className="truncate">{displayUrl(card.url)}</Ltr>
                    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
                    <span className="sr-only">{t("opensInNewTab")}</span>
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {stored.length === 0 ? <p className="text-small text-pretty text-muted-foreground">{t("moreSoon")}</p> : null}
    </div>
  );
}

type Card = { label: string; description: string | null; phone: string | null; primary: boolean };

/** Icon, name, the number in big digits and a one-line note. */
function CardText({ card, icon: Icon }: { card: Card; icon: typeof Siren }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full",
          card.primary ? "bg-destructive/12 text-destructive" : "bg-primary-tint text-primary-text",
        )}
      >
        <Icon className="size-6" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5 text-start">
        <span className="text-small font-semibold text-balance text-foreground" dir="auto">
          {card.label}
        </span>
        {card.phone ? (
          <Ltr className={cn("font-extrabold tracking-tight tabular-nums", card.primary ? "text-h1 text-destructive" : "text-h3 text-foreground")}>
            {card.phone}
          </Ltr>
        ) : null}
        {card.description ? <span className="text-caption text-pretty text-muted-foreground">{card.description}</span> : null}
      </span>
    </>
  );
}
