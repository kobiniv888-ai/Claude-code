"use client";

import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import {
  BanknoteIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  LandmarkIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { Card } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { StickyContactBar } from "@/components/ds/sticky-contact-bar";
import { StayProvider, useStay, type StayPrice } from "@/components/listing-page/stay-dates";
import { useCurrency } from "@/components/providers/currency-provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig, type AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { useRouter } from "@/i18n/navigation";
import { createBookingAction, quoteBookingAction } from "@/lib/booking/actions";
import { GUEST_NAME_MAX, MAX_STAY_NIGHTS, MESSAGE_TO_HOST_MAX, type PaymentMethod } from "@/lib/booking/constants";
import { isBookingErrorCode } from "@/lib/booking/errors";
import { clampGuests, clockText, countedGuests, guestLimit, maxGuestsFor, quoteGuestStay, withBookParams, type BookRequest } from "@/lib/booking/guest";
import type { GuestBookingTerms } from "@/lib/booking/guest-review";
import { DEFAULT_CHECK_IN_TIME } from "@/lib/booking/dates";
import { freeCancellationDeadline } from "@/lib/booking/policy";
import type { Quote } from "@/lib/booking/pricing";
import { looksLikeContact } from "@/lib/auth/first-name";
import type { LoginConfig } from "@/lib/auth/config";
import { errorMessageKey } from "@/lib/errors";
import { formatDate, formatDateRange, formatMoney, formatTime } from "@/lib/format";
import type { DateBlock } from "@/lib/listing-page/calendar";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { AskHostButton } from "./ask-host-button";
import { DatesGuestsSheet } from "./dates-guests-sheet";
import { useGuestSummary } from "./guest-summary";
import { PriceBreakdown } from "./price-breakdown";

/*
 * The phone check (phone field, country list, libphonenumber, code input, Turnstile: ~150 KB) is
 * only for signed-in guests. Rendered on the server for them as before (Next then loads its code
 * with the page); for visitors who are not signed in it is not downloaded at all.
 */
const PhoneCheck = dynamic(() => import("@/components/auth/phone-check").then((m) => m.PhoneCheck), {
  loading: () => <div aria-hidden className="h-12 animate-pulse rounded-input bg-muted motion-reduce:animate-none" />,
});

export type ReviewListing = {
  id: string;
  /** In the guest's language (render with dir="auto"). */
  title: string;
  /** "Vake · Tbilisi" */
  place: string;
  photo: { src: string; alt: string } | null;
  /** /listing/<id>-<slug>, without the locale. */
  path: string;
};

export type ReviewUser = {
  /** Prefilled from the account (first name), never a phone number or email. */
  name: string;
  /** E.164, when the account has a verified phone. */
  verifiedPhone: string | null;
};

type Props = {
  listing: ReviewListing;
  terms: GuestBookingTerms;
  initial: BookRequest;
  blocks: DateBlock[];
  /** "YYYY-MM-DD" in Georgia (from the server, so both render the same). */
  today: string;
  user: ReviewUser | null;
  phoneConfig: LoginConfig["phone"];
  /** The host's house rules, rendered on the server (null when the host set none). */
  houseRules: ReactNode;
};

const PAYMENT_ICONS: Record<PaymentMethod, LucideIcon> = { cash: BanknoteIcon, card: CreditCardIcon, bank_transfer: LandmarkIcon };

/** Replaces the address in place (no server round trip). */
function replaceSearch(update: (search: string) => string) {
  try {
    const url = new URL(window.location.href);
    window.history.replaceState(window.history.state, "", `${url.pathname}${update(url.search)}${url.hash}`);
  } catch {
    // Old browser: the page keeps working with its state.
  }
}

/**
 * "אישור הזמנה" (brief 5.5 step 2): the stay, the price, how to pay, the cancellation policy, the
 * house rules with "I agree", the guest's name and verified phone, a message to the host, and
 * "Confirm booking". The price shows at once (computed in the browser with the same pure rules as
 * the server), then the server confirms it and that the nights are still free.
 */
export function BookingReview(props: Props) {
  const { terms, initial } = props;
  const onlyRoom = terms.roomTypes.length === 1 && !(terms.price && terms.price > 0) ? terms.roomTypes[0].id : null;
  const [roomTypeId, setRoomState] = useState<string | null>(initial.roomTypeId ?? onlyRoom);
  const room = terms.roomTypes.find((r) => r.id === roomTypeId) ?? null;
  const setRoomTypeId = (id: string) => {
    setRoomState(id);
    replaceSearch((search) => withBookParams(search, { roomTypeId: id }));
  };
  const price: StayPrice = room
    ? { amount: room.price, currency: room.currency, period: "NIGHT", from: false, cleaningFee: room.currency === terms.currency ? terms.cleaningFee : null }
    : {
        amount: terms.price,
        currency: terms.currency,
        period: terms.pricePeriod,
        from: !(terms.price && terms.price > 0) && terms.roomTypes.length > 0,
        cleaningFee: terms.cleaningFee,
        weekendPrice: terms.weekendPrice,
      };

  return (
    <StayProvider
      initial={{ checkIn: initial.checkIn, checkOut: initial.checkOut }}
      guests={null}
      initialGuests={initial.guests}
      maxGuests={maxGuestsFor(terms, roomTypeId)}
      blocks={props.blocks}
      today={props.today}
      minNights={terms.minStayNights}
      maxMonths={12}
      price={price}
      listingPath={props.listing.path}
    >
      <ReviewForm key={props.user ? "user" : "guest"} {...props} roomTypeId={roomTypeId} setRoomTypeId={setRoomTypeId} />
      <DatesGuestsSheet mode="apply" />
    </StayProvider>
  );
}

type ServerCheck = { key: string; available: boolean; quote: Quote | null; error: string | null };

function ReviewForm({
  listing,
  terms,
  user,
  phoneConfig,
  houseRules,
  roomTypeId,
  setRoomTypeId,
}: Props & { roomTypeId: string | null; setRoomTypeId: (id: string) => void }) {
  const t = useTranslations("booking");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const requireLogin = useRequireLogin();
  const guestSummary = useGuestSummary();
  const { currency, rates } = useCurrency();
  const { dates, guests, setGuests, setSheetOpen, nights, maxGuests, rules } = useStay();
  const ids = useId();
  const brand = siteConfig.localizedName[locale as AppLocale] ?? siteConfig.name;

  const request: BookRequest = useMemo(
    () => ({ checkIn: dates.checkIn, checkOut: dates.checkOut, guests, roomTypeId }),
    [dates.checkIn, dates.checkOut, guests, roomTypeId],
  );
  const local = useMemo(() => quoteGuestStay(terms, request, { today: rules.today, displayCurrency: currency, rates }), [terms, request, rules.today, currency, rates]);

  // A room type with fewer places: keep the counts within its maximum.
  useEffect(() => {
    if (countedGuests(guests) > guestLimit(maxGuests)) setGuests(clampGuests(guests, maxGuests));
  }, [guests, maxGuests, setGuests]);

  // The server confirms the price and that every night is still free (debounced).
  const key = JSON.stringify([request, currency]);
  const [server, setServer] = useState<ServerCheck | null>(null);
  useEffect(() => {
    if (!local.ok) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      const result = await quoteBookingAction({
        listingId: terms.id,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        ...request.guests,
        roomTypeId: request.roomTypeId,
        currency,
        locale,
      }).catch(() => null);
      if (!alive || !result) return;
      setServer(
        result.ok
          ? { key, available: result.data.available, quote: result.data.quote, error: null }
          : { key, available: true, quote: null, error: result.error },
      );
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [key, local.ok, terms.id, request, currency, locale]);
  const confirmed = server?.key === key ? server : null;
  const checking = local.ok && !confirmed;
  const quote = confirmed?.quote ?? (local.ok ? local.quote : null);
  const busy = !!confirmed && !confirmed.available;

  // Guest details.
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState<string | null>(user?.verifiedPhone ?? null);
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; rules?: string }>({});
  const [taken, setTaken] = useState(false);
  const [pending, startTransition] = useTransition();
  const phoneBlocked = !!user && !phone && !phoneConfig.available;

  const errorText = (code: string) => {
    if (!isBookingErrorCode(code)) return te(errorMessageKey(code));
    const count = code === "min_stay" ? Math.max(1, terms.minStayNights ?? 1) : code === "too_many_guests" ? guestLimit(maxGuests) : MAX_STAY_NIGHTS;
    return t(`errors.${code}`, { count });
  };
  const stayError = !local.ok && local.error !== "no_dates" ? local.error : (confirmed?.error ?? null);

  const focus = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  };

  const submit = () => {
    if (!user) {
      void requireLogin(async () => router.refresh());
      return;
    }
    if (!local.ok || busy) {
      if (local.ok || local.error === "no_dates" || local.error === "min_stay" || local.error === "dates_past") setSheetOpen(true);
      else focus(`${ids}-stay`);
      return;
    }
    const next: typeof errors = {};
    if (!name.trim() || looksLikeContact(name)) next.name = t("errors.name_required");
    if (!phone) next.phone = t("review.verifyFirst");
    if (!accepted) next.rules = t("errors.rules_not_accepted");
    setErrors(next);
    const first = next.rules ? `${ids}-rules` : next.name ? `${ids}-name` : next.phone ? `${ids}-phone` : null;
    if (first) {
      focus(first);
      return;
    }
    setTaken(false);
    startTransition(async () => {
      const result = await createBookingAction({
        listingId: terms.id,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        ...request.guests,
        roomTypeId: request.roomTypeId,
        guestName: name,
        messageToHost: message,
        rulesAccepted: true,
        locale,
      }).catch(() => ({ ok: false as const, error: "server_error" }));
      if (result.ok) {
        router.push(`${result.data.path}?booked=1`);
        return;
      }
      switch (result.error) {
        case "dates_unavailable":
          // Someone else got these nights a moment ago: fresh calendar, friendly message.
          setTaken(true);
          router.refresh();
          focus(`${ids}-stay`);
          break;
        case "phone_not_verified":
          setPhone(null);
          setErrors({ phone: t("review.verifyFirst") });
          focus(`${ids}-phone`);
          break;
        case "rules_not_accepted":
          setErrors({ rules: t("errors.rules_not_accepted") });
          focus(`${ids}-rules`);
          break;
        case "name_required":
        case "too_long":
          setErrors({ name: errorText(result.error) });
          focus(`${ids}-name`);
          break;
        case "auth_required":
          void requireLogin(async () => router.refresh());
          break;
        default:
          toast.error(errorText(result.error));
      }
    });
  };

  const [now] = useState(() => Date.now());
  const deadline = dates.checkIn ? freeCancellationDeadline(terms.cancellationPolicy, dates.checkIn, terms.checkInFrom) : null;
  const money = (amount: number, code = quote?.currency ?? terms.currency) => formatMoney(amount, code, locale);
  const totalLine = quote ? (
    <span className="grid min-w-0">
      <span className="truncate text-body font-semibold tabular-nums">
        <bdi>{money(quote.total)}</bdi>
      </span>
      <span className="truncate text-caption text-muted-foreground">{t("price.nights", { count: quote.nights })}</span>
    </span>
  ) : (
    <span className="line-clamp-2 text-caption text-muted-foreground">{stayError ? errorText(stayError) : t("sheet.pickDates")}</span>
  );
  const submitButton = (block: boolean) =>
    phoneBlocked ? (
      <AskHostButton className={block ? "w-full" : "flex-1 shrink"} />
    ) : (
      <Button block={block} className={block ? undefined : "min-w-0 flex-1 shrink"} onClick={submit} disabled={pending} aria-busy={pending || undefined}>
        <span className="truncate">{pending ? t("review.submitting") : t("review.submit")}</span>
      </Button>
    );

  const changeButton = (label: string) => (
    <button
      type="button"
      onClick={() => setSheetOpen(true)}
      aria-label={label}
      className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {t("review.change")}
    </button>
  );

  const stayCard = (
    <Card as="section" aria-labelledby={`${ids}-stay-title`} className="grid gap-3">
      <h2 id={`${ids}-stay-title`} className="sr-only">
        {t("review.stay")}
      </h2>
      <div className="flex items-center gap-3">
        {listing.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- already a sized WebP from the media route
          <img src={listing.photo.src} alt={listing.photo.alt} width={80} height={80} className="size-20 shrink-0 rounded-xl object-cover" />
        ) : null}
        <div className="grid min-w-0 gap-0.5">
          <p dir="auto" className="line-clamp-2 text-h3 font-semibold">
            {listing.title}
          </p>
          {listing.place ? <p className="truncate text-caption text-muted-foreground">{listing.place}</p> : null}
        </div>
      </div>
      <dl className="grid divide-y divide-border border-t border-border">
        {/* A dl row may hold only dt/dd: the "change" button sits in its own dd on the end side. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2">
          <dt className="col-start-1 text-caption text-muted-foreground">{t("review.dates")}</dt>
          <dd className="col-start-1 min-w-0 text-small font-medium">
            {dates.checkIn && dates.checkOut ? (
              <>
                {formatDateRange(dates.checkIn, dates.checkOut, locale, { day: "numeric", month: "short" })} · {t("price.nights", { count: nights })}
              </>
            ) : (
              <span className="text-muted-foreground">{t("review.noDates")}</span>
            )}
          </dd>
          <dd className="col-start-2 row-span-2 row-start-1">{changeButton(t("review.changeDates"))}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2">
          <dt className="col-start-1 text-caption text-muted-foreground">{t("sheet.guests")}</dt>
          <dd className="col-start-1 min-w-0 text-small font-medium">{guestSummary(guests)}</dd>
          <dd className="col-start-2 row-span-2 row-start-1">{changeButton(t("review.changeGuests"))}</dd>
        </div>
      </dl>
      {terms.checkInFrom || terms.checkOutUntil ? (
        <p className="text-caption text-muted-foreground">
          {t("review.times", { in: clockText(terms.checkInFrom ?? DEFAULT_CHECK_IN_TIME, locale) ?? "", out: clockText(terms.checkOutUntil ?? "11:00", locale) ?? "" })}
        </p>
      ) : null}
      {terms.roomTypes.length > 0 ? (
        <fieldset className="grid gap-2 border-t border-border pt-3">
          <legend className="float-start mb-1 w-full text-small font-semibold">{t("review.room")}</legend>
          {terms.roomTypes.map((r) => (
            <label
              key={r.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-input border px-3 py-2 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                r.id === roomTypeId ? "border-primary bg-primary-tint" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name={`${ids}-room`} value={r.id} checked={r.id === roomTypeId} onChange={() => setRoomTypeId(r.id)} className="size-4 accent-(--primary)" />
              <span className="grid min-w-0 flex-1">
                <span dir="auto" className="truncate text-small font-medium">
                  {pickLocalized(r.names, locale) || t("review.room")}
                </span>
                {r.maxGuests ? <span className="text-caption text-muted-foreground">{t("review.roomGuests", { count: r.maxGuests })}</span> : null}
              </span>
              <span className="shrink-0 text-small tabular-nums">
                {t("review.roomPerNight", { price: `⁦${formatMoney(r.price, r.currency, locale)}⁩` })}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div id={`${ids}-stay`} tabIndex={-1} className="outline-none" aria-live="polite">
        {taken || busy ? (
          <Alert title={taken ? t("review.takenTitle") : t("review.busyTitle")} text={taken ? t("review.takenText") : t("review.busyText")}>
            <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => setSheetOpen(true)}>
              <CalendarDaysIcon aria-hidden />
              {t("review.pickOther")}
            </Button>
          </Alert>
        ) : stayError ? (
          <Alert text={errorText(stayError)}>
            {stayError === "room_type_required" ? null : (
              <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => setSheetOpen(true)}>
                <CalendarDaysIcon aria-hidden />
                {t("review.chooseDates")}
              </Button>
            )}
          </Alert>
        ) : !dates.checkIn || !dates.checkOut ? (
          <Button variant="soft" block onClick={() => setSheetOpen(true)}>
            <CalendarDaysIcon aria-hidden />
            {t("review.chooseDates")}
          </Button>
        ) : null}
      </div>
    </Card>
  );

  const priceCard = (
    <Card as="section" aria-labelledby={`${ids}-price-title`} className="grid gap-3">
      <h2 id={`${ids}-price-title`} className="text-h2">
        {t("price.title")}
      </h2>
      {quote ? (
        <PriceBreakdown quote={quote} pending={checking} />
      ) : local.ok === false && local.error === "no_dates" ? (
        <p className="text-small text-muted-foreground">{t("sheet.pickDates")}</p>
      ) : stayError ? (
        <p className="text-small text-muted-foreground">{errorText(stayError)}</p>
      ) : (
        <div className="grid gap-2" aria-hidden>
          <div className="h-4 w-3/4 rounded skeleton-shimmer" />
          <div className="h-4 w-1/2 rounded skeleton-shimmer" />
        </div>
      )}
      {quote ? (
        <p className="rounded-input bg-surface-muted px-3 py-2 text-caption text-muted-foreground">
          {t("payAtCheckIn", { currency: t(`inCurrency.${quote.currency}`) })}
          {quote.display ? ` ${t("estimateNote", { currency: t(`inCurrency.${quote.display.currency}`) })}` : null}
        </p>
      ) : null}
      <p className="text-caption text-muted-foreground" aria-live="polite">
        {checking ? t("review.checking") : null}
      </p>
    </Card>
  );

  const desktopSubmit = (
    <div className="hidden gap-2 lg:grid">
      {submitButton(true)}
      {!phoneBlocked ? <p className="text-center text-caption text-muted-foreground">{t("review.instantNote")}</p> : null}
    </div>
  );

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
        <div className="grid gap-4 lg:sticky lg:top-[calc(var(--header-height,4rem)+1.5rem)] lg:col-start-2 lg:row-start-1">
          {stayCard}
          {priceCard}
          {desktopSubmit}
        </div>

        <div className="grid gap-4 lg:col-start-1 lg:row-start-1">
          <Card as="section" aria-labelledby={`${ids}-pay-title`} className="grid gap-4">
            <h2 id={`${ids}-pay-title`} className="text-h2">
              {t("review.payTitle")}
            </h2>
            <div className="grid gap-2">
              <h3 className="text-small font-semibold">{t("review.methods")}</h3>
              {terms.paymentMethods.length ? (
                <ul className="flex flex-wrap gap-2">
                  {terms.paymentMethods.map((method) => {
                    const Icon = PAYMENT_ICONS[method];
                    return (
                      <li key={method} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-small">
                        <Icon className="size-4 text-primary-text" aria-hidden />
                        {t(`paymentMethod.${method}`)}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-small text-muted-foreground">{t("review.methodsNone")}</p>
              )}
            </div>
            <div className="grid gap-1">
              <h3 className="text-small font-semibold">
                {t("review.cancellation")} · {t(`policy.${terms.cancellationPolicy}.name`)}
              </h3>
              <p className="text-small">{t(`policy.${terms.cancellationPolicy}.rule`)}.</p>
              {deadline ? (
                <p className="text-small text-muted-foreground">
                  {deadline.getTime() > now
                    ? t("policy.freeUntil", {
                        date: formatDate(deadline, locale, { weekday: "short", day: "numeric", month: "long" }),
                        time: formatTime(deadline, locale),
                      })
                    : t("policy.freePassed")}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <h3 className="text-small font-semibold">{t("review.houseRules")}</h3>
              {houseRules ?? <p className="text-small text-muted-foreground">{t("review.noRules")}</p>}
            </div>
            <div className={cn("grid gap-1 rounded-input border p-3", errors.rules ? "border-destructive" : "border-border")}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`${ids}-rules`}
                  checked={accepted}
                  onCheckedChange={(value) => {
                    setAccepted(value === true);
                    if (value === true) setErrors((e) => ({ ...e, rules: undefined }));
                  }}
                  aria-invalid={!!errors.rules || undefined}
                  aria-describedby={`${ids}-rules-hint`}
                  className="mt-0.5 size-5"
                />
                <label htmlFor={`${ids}-rules`} className="grid cursor-pointer gap-0.5">
                  <span className="text-body font-medium">{t("review.accept")}</span>
                  <span id={`${ids}-rules-hint`} className="text-caption text-muted-foreground">
                    {t("review.acceptHint")}
                  </span>
                </label>
              </div>
              {errors.rules ? (
                <p role="alert" className="text-small text-destructive">
                  {errors.rules}
                </p>
              ) : null}
            </div>
          </Card>

          <Card as="section" aria-labelledby={`${ids}-guest-title`} className="grid gap-4">
            <h2 id={`${ids}-guest-title`} className="text-h2">
              {t("review.guestTitle")}
            </h2>
            {!user ? (
              <div className="grid gap-3 rounded-input bg-surface-muted p-4">
                <div className="flex items-start gap-3">
                  <UserRoundIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
                  <div className="grid gap-0.5">
                    <p className="text-body font-semibold">{t("review.loginTitle")}</p>
                    <p className="text-small text-muted-foreground">{t("review.loginText")}</p>
                  </div>
                </div>
                <Button onClick={() => void requireLogin(async () => router.refresh())}>{t("review.login")}</Button>
              </div>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <label htmlFor={`${ids}-name`} className="text-small font-semibold">
                    {t("review.name")}
                  </label>
                  <Input
                    id={`${ids}-name`}
                    dir={name ? "auto" : undefined}
                    autoComplete="given-name"
                    value={name}
                    maxLength={GUEST_NAME_MAX}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
                    }}
                    aria-invalid={!!errors.name || undefined}
                    aria-describedby={`${ids}-name-hint`}
                    className="h-12 text-body"
                  />
                  <p id={`${ids}-name-hint`} className={cn("text-caption", errors.name ? "text-destructive" : "text-muted-foreground")} role={errors.name ? "alert" : undefined}>
                    {errors.name ?? t("review.nameHint")}
                  </p>
                </div>
                <div id={`${ids}-phone`} tabIndex={-1} className="grid gap-1.5 outline-none">
                  <p className="text-small font-semibold">{t("review.phone")}</p>
                  {phoneBlocked ? (
                    <div role="status" className="grid gap-3 rounded-input border border-border bg-surface-muted p-3.5">
                      <div className="grid gap-0.5">
                        <p className="text-small font-semibold">{t("review.phoneOffTitle")}</p>
                        <p className="text-small text-muted-foreground">{t("review.phoneOffText")}</p>
                      </div>
                      <AskHostButton variant="secondary" className="justify-self-start" />
                    </div>
                  ) : (
                    <>
                      <p className="text-caption text-muted-foreground">{t("review.phoneHint")}</p>
                      <PhoneCheck
                        config={phoneConfig}
                        verifiedPhone={user.verifiedPhone}
                        onVerified={(value) => {
                          setPhone(value);
                          setErrors((e) => ({ ...e, phone: undefined }));
                        }}
                        onChangeStart={() => setPhone(null)}
                      />
                    </>
                  )}
                  {errors.phone ? (
                    <p role="alert" className="text-small text-destructive">
                      {errors.phone}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor={`${ids}-message`} className="text-small font-semibold">
                    {t("review.message")}
                  </label>
                  <Textarea
                    id={`${ids}-message`}
                    dir={message ? "auto" : undefined}
                    rows={3}
                    maxLength={MESSAGE_TO_HOST_MAX}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={t("review.messageHint")}
                    className="text-body"
                  />
                </div>
              </>
            )}
          </Card>

          <p className="flex items-start gap-3 rounded-card border border-border bg-surface-muted p-4 text-small">
            <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
            <span>{t("noPrepayment", { brand })}</span>
          </p>
        </div>
      </div>

      <StickyContactBar label={t("review.title")} className="bottom-0 pb-[env(safe-area-inset-bottom,0px)]" price={totalLine} primary={submitButton(false)} />
    </>
  );
}

function Alert({ title, text, children }: { title?: string; text: string; children?: ReactNode }) {
  return (
    <div role="alert" className="grid gap-2 rounded-input border border-warning/40 bg-warning-soft p-3">
      <div className="flex items-start gap-2.5">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="grid gap-0.5">
          {title ? <p className="text-small font-semibold">{title}</p> : null}
          <p className="text-small">{text}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
