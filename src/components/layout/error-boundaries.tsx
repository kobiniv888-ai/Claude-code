"use client";

import { lazy, Suspense, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { afterLoadIdle } from "@/lib/idle";
import type { ErrorView as ErrorViewComponent } from "./error-view";

/**
 * The error boundaries of the [locale] and (site) segments (src/app/[locale]/error.tsx and
 * src/app/[locale]/(site)/error.tsx re-export these). Both live in this one small module and load
 * the error page itself (ErrorView) only when it is needed: Next.js downloads every error
 * boundary's code with each page, so the view (with its logo, buttons and icons) came twice in
 * every first load, in two extra requests. Now it is one tiny module, and the view's code is
 * fetched once the page has settled (so it is there, also offline, when an error happens) or at
 * the error itself. On the server the view renders as before.
 */

type BoundaryProps = { error: unknown; retry: () => void };
type ViewProps = BoundaryProps & { standalone?: boolean };

let loaded: typeof ErrorViewComponent | null = null;
let loading: Promise<typeof ErrorViewComponent> | null = null;

function loadErrorView(): Promise<typeof ErrorViewComponent> {
  loading ??= import("./error-view").then(
    (module) => (loaded = module.ErrorView),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

if (typeof window !== "undefined") afterLoadIdle(() => void loadErrorView().catch(() => {}));

/** When the view's code cannot be fetched (offline before it was ever loaded): the same words, plainly. */
function BasicErrorView({ retry, standalone }: ViewProps) {
  const t = useTranslations("states.error");
  return (
    <div className={standalone ? "flex min-h-dvh items-center justify-center px-4" : "flex min-h-[60vh] items-center justify-center px-4 py-6"}>
      <div role="alert" className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-5 font-medium text-primary-foreground"
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}

const LazyErrorView = lazy(
  (): Promise<{ default: ComponentType<ViewProps> }> =>
    loadErrorView().then(
      (component) => ({ default: component }),
      () => ({ default: BasicErrorView }),
    ),
);

function ErrorPage(props: ViewProps) {
  const View = loaded ?? LazyErrorView;
  return (
    <Suspense fallback={<div className={props.standalone ? "min-h-dvh" : "min-h-[60vh]"} />}>
      <View {...props} />
    </Suspense>
  );
}

/** Errors in the site layout itself (header, banners): a self-contained page with a way back. */
export function LocaleError({ error, retry }: BoundaryProps) {
  return <ErrorPage error={error} retry={retry} standalone />;
}

/** Errors in a page: shown inside the site frame, so the header and footer stay usable. */
export function SiteError({ error, retry }: BoundaryProps) {
  return <ErrorPage error={error} retry={retry} />;
}
