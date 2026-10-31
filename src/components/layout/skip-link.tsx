import { useTranslations } from "next-intl";

/** First focusable element on every page: jumps over the header to <main id="main">. */
export function SkipLink() {
  const t = useTranslations("nav");
  return (
    <a
      href="#main"
      className="fixed start-3 top-3 z-[100] -translate-y-24 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-float transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {t("skipToContent")}
    </a>
  );
}
