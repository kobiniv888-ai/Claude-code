import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Container } from "@/components/common/container";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { submitUnsubscribe } from "@/lib/alerts/unsubscribe-actions";
import { weeklyStatsEmailOn } from "@/lib/alerts/unsubscribe-server";
import { verifyUnsubscribeToken } from "@/lib/alerts/unsubscribe-token";
import { unsubscribePlan } from "@/lib/alerts/unsubscribe-view";
import { pageMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.unsubscribe" });
  return pageMetadata({ locale, path: "/unsubscribe", title: t("metaTitle"), description: t("metaDescription"), noIndex: true });
}

/**
 * /unsubscribe?t=<signed token> — the link in the weekly host stats email (round 3, brief 6.2).
 * No login: the signed token names the account (src/lib/alerts/unsubscribe-token.ts). One tap
 * on the button turns the weekly email off; the same page offers to turn it back on, and the
 * account settings have the switch too. The link itself changes nothing (mail apps open links to
 * scan them), only the button does.
 */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("account.unsubscribe");
  const token = one(query.t);
  const state = one(query.state);
  const verified = verifyUnsubscribeToken(token);
  const current = verified ? await weeklyStatsEmailOn(verified.userId) : null;

  // After an error, "retry" repeats what was asked (`on=1`: turn it back on), never the opposite.
  const { view, done, turnOn, showsForm, label } = unsubscribePlan({ valid: !!verified, current, state, retryOn: one(query.on) === "1" });

  return (
    <Container size="prose" className="py-10 sm:py-16">
      <section aria-labelledby="unsubscribe-title" className="mx-auto grid max-w-lg gap-4 rounded-2xl border bg-card p-6 text-center shadow-xs sm:p-8">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
          <SpriteIcon name={done ? "circle-check" : view === "invalid" || view === "error" ? "info" : "mail"} className="size-6" />
        </span>
        <h1 id="unsubscribe-title" className="text-xl font-semibold text-balance sm:text-2xl">
          {t(`${view}.title`)}
        </h1>
        <p className="text-muted-foreground" role={done ? "status" : undefined}>
          {t(`${view}.body`)}
        </p>
        {showsForm && verified ? (
          <form action={submitUnsubscribe} className="grid gap-3">
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="on" value={turnOn ? "1" : "0"} />
            <Button type="submit" size="lg" variant={turnOn ? "outline" : "default"} className="h-12 w-full rounded-xl text-base">
              {t(label)}
            </Button>
          </form>
        ) : null}
        <p className="text-sm">
          <Link href="/account/settings#notifications" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("settings")}
          </Link>
        </p>
      </section>
    </Container>
  );
}
