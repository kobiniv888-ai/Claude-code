"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  BellOffIcon,
  BellRingIcon,
  ExternalLinkIcon,
  LoaderIcon,
  MailIcon,
  MessageSquareIcon,
  SendIcon,
  SmartphoneIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button, buttonStyles } from "@/components/ds/button";
import { IconCircle } from "@/components/ds/icon-circle";
import { Tag } from "@/components/ds/tag";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/config/site";
import {
  connectTelegramAction,
  disconnectTelegramAction,
  removePushDeviceAction,
  savePushSubscriptionAction,
  sendTestAlertAction,
  setAlertChannelAction,
  telegramLinkStatusAction,
} from "@/lib/alerts/actions";
import type { BookingAlertSettings } from "@/lib/alerts/settings";
import type { AlertChannel } from "@/lib/alerts/rules";
import { errorMessageKey } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * "Booking alerts" in the account settings (round 3, founder's answer 4): how Bayit tells the host
 * about new bookings and cancellations. Email and Telegram confirm delivery; browser notifications
 * are an extra; SMS and WhatsApp come later (paid). The banner on top says whether instant booking
 * is on and, if not, why (the same reasons as the booking step's notice).
 *
 *   <BookingAlerts data={await getBookingAlertSettings(user.id, await headers())} channelsText="email and Telegram" />
 */

type ChannelRow = BookingAlertSettings["channels"][number];

/** Action buttons wrap their label instead of widening the page (long Georgian / Russian labels at 360px). */
const ACTION = "h-auto min-h-button-sm max-w-full py-2 text-start whitespace-normal";

function useAlertError() {
  const own = useTranslations("alerts.errors");
  const shared = useTranslations("errors");
  return (code: string | null | undefined) => {
    const key = code ?? "server_error";
    return own.has(key) ? own(key) : shared(errorMessageKey(key));
  };
}

export function BookingAlerts({ data, channelsText }: { data: BookingAlertSettings; channelsText: string | null }) {
  const t = useTranslations("alerts");
  const channel = (name: AlertChannel) => data.channels.find((c) => c.channel === name)!;
  return (
    <div className="grid gap-5">
      <GateBanner data={data} channelsText={channelsText} />
      <ul className="grid divide-y rounded-xl border">
        <EmailRow data={data} row={channel("email")} />
        <TelegramRow data={data} row={channel("telegram")} />
        <PushRow data={data} row={channel("push")} />
        <LaterRow />
      </ul>
      <div className="grid gap-3">
        <TestButton />
        <p className="text-xs text-pretty text-muted-foreground">{t("settings.guestsNote")}</p>
      </div>
    </div>
  );
}

function GateBanner({ data, channelsText }: { data: BookingAlertSettings; channelsText: string | null }) {
  const t = useTranslations("alerts");
  if (data.gate.ok) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-primary-tint-border bg-primary-tint p-3 sm:p-4">
        <ZapIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm font-semibold">{t("settings.instantOn")}</p>
          {channelsText ? <p className="text-sm text-pretty text-muted-foreground">{t("settings.instantOnText", { channels: channelsText })}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-border-strong bg-surface-muted p-3 sm:p-4">
      <BellOffIcon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
      <div className="grid min-w-0 gap-0.5">
        <p className="text-sm font-semibold">{t("settings.instantOff")}</p>
        <p className="text-sm text-pretty text-muted-foreground">
          {t.rich(`reason.${data.gate.reason}`, {
            telegram: data.telegram.configured ? "yes" : "no",
            address: () => <Ltr className="font-medium wrap-anywhere text-foreground">{data.failingAddress ?? ""}</Ltr>,
          })}
        </p>
      </div>
    </div>
  );
}

/** One channel: icon, name, tags, what is going on, a switch and actions. */
function Row({
  icon,
  title,
  tags,
  children,
  toggle,
  actions,
}: {
  icon: typeof MailIcon;
  title: string;
  tags?: ReactNode;
  children?: ReactNode;
  toggle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="grid min-w-0 gap-3 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <IconCircle icon={icon} size="sm" />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            {tags}
          </div>
          {children ? <div className="grid gap-1 text-sm text-pretty text-muted-foreground">{children}</div> : null}
        </div>
        {toggle ? <div className="pt-0.5">{toggle}</div> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap gap-2 sm:ps-12">{actions}</div> : null}
    </li>
  );
}

function ChannelSwitch({ row, label }: { row: ChannelRow; label: string }) {
  const router = useRouter();
  const errorText = useAlertError();
  const [on, setOn] = useState(row.on);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={on}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(next) => {
        setOn(next);
        startTransition(async () => {
          const result = await setAlertChannelAction({ channel: row.channel, on: next });
          if (!result.ok) {
            setOn(!next);
            toast.error(errorText(result.error));
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}

function ConfirmsTag() {
  const t = useTranslations("alerts.settings");
  return <Tag variant="primary">{t("confirms")}</Tag>;
}

function SoonTag({ label }: { label?: string }) {
  const t = useTranslations("alerts.settings");
  return <Tag>{label ?? t("comingSoon")}</Tag>;
}

// ─── Email ────────────────────────────────────────────────────

function EmailRow({ data, row }: { data: BookingAlertSettings; row: ChannelRow }) {
  const t = useTranslations("alerts");
  const renderAddress = (value: string | null) => <Ltr className="font-medium wrap-anywhere text-foreground">{value ?? ""}</Ltr>;
  const linkClass = buttonStyles({ variant: "secondary", className: ACTION });
  let body: ReactNode;
  let actions: ReactNode = null;
  switch (row.state) {
    case "ready":
      body = (
        <>
          <p>{t.rich("settings.email.sendsTo", { address: () => renderAddress(data.emailAddress) })}</p>
          {data.outbox ? <p className="text-xs">{t("settings.email.outbox")}</p> : null}
        </>
      );
      break;
    case "off":
      body = <p>{t("settings.email.off")}</p>;
      break;
    case "no_email":
      body = <p>{t("settings.email.noEmail")}</p>;
      actions = (
        <a href="#email" className={linkClass}>
          {t("settings.email.addEmail")}
        </a>
      );
      break;
    case "failing":
      body = (
        <>
          <p>{t.rich("settings.email.failing", { address: () => renderAddress(data.failingAddress) })}</p>
          <p className="text-xs">{t("settings.email.failingHint")}</p>
        </>
      );
      actions = (
        <a href="#email" className={linkClass}>
          {t("settings.email.changeEmail")}
        </a>
      );
      break;
    default:
      body = <p>{t("settings.email.notConfigured")}</p>;
  }
  return (
    <Row
      icon={MailIcon}
      title={t("channel.email")}
      tags={<ConfirmsTag />}
      toggle={<ChannelSwitch row={row} label={t("settings.toggle", { channel: t("channel.email") })} />}
      actions={actions}
    >
      {body}
    </Row>
  );
}

// ─── Telegram ─────────────────────────────────────────────────

/** How long the page waits for "/start" in Telegram before it stops checking by itself. */
const TELEGRAM_WAIT_MS = 3 * 60_000;
const TELEGRAM_POLL_MS = 3_000;

function TelegramRow({ data, row }: { data: BookingAlertSettings; row: ChannelRow }) {
  const t = useTranslations("alerts");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const errorText = useAlertError();
  const [link, setLink] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [pending, startTransition] = useTransition();
  const stopAt = useRef(0);

  const check = useCallback(async () => {
    const result = await telegramLinkStatusAction();
    if (result.ok && result.data.linked) {
      setWaiting(false);
      setLink(null);
      toast.success(t("settings.telegram.connectedToast"));
      router.refresh();
      return true;
    }
    return false;
  }, [router, t]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (Date.now() > stopAt.current) {
        window.clearInterval(timer);
        return;
      }
      void check();
    }, TELEGRAM_POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [waiting, check]);

  const connect = () =>
    startTransition(async () => {
      const result = await connectTelegramAction();
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      setLink(result.data.url);
    });

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectTelegramAction();
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      toast.success(t("settings.telegram.disconnectedToast"));
      router.refresh();
    });

  // Step 2 of connecting: a real link (opens Telegram even on an iPhone), then wait for /start.
  const openLink = link ? (
    <>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonStyles({ variant: "primary", size: "sm", className: ACTION })}
        onClick={() => {
          stopAt.current = Date.now() + TELEGRAM_WAIT_MS;
          setWaiting(true);
        }}
      >
        <ExternalLinkIcon aria-hidden className="rtl:-scale-x-100" />
        {t("settings.telegram.open")}
      </a>
      {waiting ? (
        <Button variant="ghost" size="sm" className={ACTION} onClick={() => void check()}>
          {t("settings.telegram.checkAgain")}
        </Button>
      ) : null}
    </>
  ) : null;

  const connectButton = (label: string) =>
    openLink ?? (
      <Button variant="secondary" size="sm" className={ACTION} disabled={pending} onClick={connect}>
        {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden className="rtl:-scale-x-100" />}
        {label}
      </Button>
    );

  let body: ReactNode;
  let actions: ReactNode = null;
  let toggle: ReactNode = null;
  const disconnectButton = (
    <Button variant="ghost" size="sm" className={ACTION} disabled={pending} onClick={disconnect}>
      {t("settings.telegram.disconnect")}
    </Button>
  );
  switch (row.state) {
    case "not_configured":
      body = <p>{t("settings.telegram.notConfigured")}</p>;
      break;
    case "not_linked":
      body = <p>{waiting ? t("settings.telegram.waiting") : t("settings.telegram.intro")}</p>;
      actions = connectButton(t("settings.telegram.connect"));
      break;
    case "failing":
      body = <p>{waiting ? t("settings.telegram.waiting") : t("settings.telegram.failing")}</p>;
      actions = (
        <>
          {connectButton(t("settings.telegram.reconnect"))}
          {link ? null : disconnectButton}
        </>
      );
      break;
    default:
      body = (
        <p>
          {row.state === "off"
            ? t("settings.telegram.off")
            : data.telegram.linkedAt
              ? t("settings.telegram.connected", { date: formatDate(data.telegram.linkedAt, locale, { dateStyle: "medium" }) })
              : null}
        </p>
      );
      toggle = <ChannelSwitch row={row} label={t("settings.toggle", { channel: t("channel.telegram") })} />;
      actions = disconnectButton;
  }
  return (
    <Row
      icon={SendIcon}
      title={t("channel.telegram")}
      tags={row.state === "not_configured" ? <SoonTag /> : <ConfirmsTag />}
      toggle={toggle}
      actions={actions}
    >
      {body}
    </Row>
  );
}

// ─── Browser / app notifications ──────────────────────────────

type PushSupport = "checking" | "ok" | "unsupported" | "iphone_install";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function pushSupport(): PushSupport {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (capable) return "ok";
  // iPhone and iPad: web push only works for a site added to the Home Screen (iOS 16.4+).
  return isIos() && !isStandalone() ? "iphone_install" : "unsupported";
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** sha256(endpoint), first 16 hex characters: the same key the server gives each device. */
async function endpointKey(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function PushRow({ data, row }: { data: BookingAlertSettings; row: ChannelRow }) {
  const t = useTranslations("alerts");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const errorText = useAlertError();
  const listId = useId();
  const [support, setSupport] = useState<PushSupport>("checking");
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [thisKey, setThisKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    const found = pushSupport();
    // Reading the browser's state after mount (it does not exist on the server).
    queueMicrotask(() => alive && setSupport(found));
    if (found !== "ok") return;
    queueMicrotask(() => alive && setPermission(Notification.permission));
    currentSubscription()
      .then(async (subscription) => {
        const key = subscription ? await endpointKey(subscription.endpoint) : null;
        if (alive) setThisKey(key);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const devices = data.push.devices;
  const thisDeviceOn = !!thisKey && devices.some((d) => d.key === thisKey);

  const enable = () =>
    startTransition(async () => {
      try {
        if (!data.push.publicKey) return;
        const granted = await Notification.requestPermission();
        setPermission(granted);
        if (granted !== "granted") return;
        // Registered here too (the site registers it in production builds only).
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(data.push.publicKey) }));
        const json = subscription.toJSON();
        const result = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: json.keys });
        if (!result.ok) {
          toast.error(errorText(result.error));
          return;
        }
        setThisKey(await endpointKey(subscription.endpoint));
        toast.success(t("settings.push.enabledToast"));
        router.refresh();
      } catch (error) {
        console.warn("[alerts] could not turn notifications on", error);
        toast.error(t("settings.push.failed"));
      }
    });

  const disable = () =>
    startTransition(async () => {
      const subscription = await currentSubscription().catch(() => null);
      if (subscription) {
        await removePushDeviceAction({ endpoint: subscription.endpoint });
        await subscription.unsubscribe().catch(() => false);
      }
      setThisKey(null);
      toast.success(t("settings.push.disabledToast"));
      router.refresh();
    });

  const removeDevice = (id: string) =>
    startTransition(async () => {
      const result = await removePushDeviceAction({ id });
      if (!result.ok) toast.error(errorText(result.error));
      router.refresh();
    });

  const notConfigured = row.state === "not_configured";
  let note: ReactNode = null;
  let actions: ReactNode = null;
  if (notConfigured) {
    note = <p>{t("settings.push.notConfigured")}</p>;
  } else if (support === "iphone_install") {
    note = <p className="rounded-lg bg-surface-muted px-3 py-2 text-foreground">{t("settings.push.iphone")}</p>;
  } else if (support === "unsupported") {
    note = <p>{t("settings.push.unsupported")}</p>;
  } else if (support === "ok") {
    if (permission === "denied") note = <p>{t("settings.push.denied")}</p>;
    else if (thisDeviceOn) note = <p>{t("settings.push.thisDevice")}</p>;
    actions = thisDeviceOn ? (
      <Button variant="secondary" size="sm" className={ACTION} disabled={pending} onClick={disable}>
        {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : <BellOffIcon aria-hidden />}
        {t("settings.push.disable")}
      </Button>
    ) : permission === "denied" ? null : (
      <Button variant="secondary" size="sm" className={ACTION} disabled={pending} onClick={enable}>
        {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : <BellRingIcon aria-hidden />}
        {t("settings.push.enable")}
      </Button>
    );
  }

  return (
    <Row
      icon={SmartphoneIcon}
      title={t("channel.push")}
      tags={notConfigured ? <SoonTag /> : <Tag>{t("settings.extra")}</Tag>}
      toggle={devices.length > 0 && !notConfigured ? <ChannelSwitch row={row} label={t("settings.toggle", { channel: t("channel.push") })} /> : null}
      actions={actions}
    >
      <p>{t("settings.push.intro")}</p>
      {note}
      {devices.length > 0 ? (
        <div className="grid gap-1 pt-1">
          <p id={listId} className="text-xs font-medium text-foreground">
            {t("settings.push.devices", { count: devices.length })}
          </p>
          <ul aria-labelledby={listId} className="grid gap-1">
            {devices.map((device) => {
              const label = device.label ?? t("settings.push.unknownDevice");
              return (
                <li key={device.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted ps-3 pe-1 text-xs">
                  <span className={cn("min-w-0 truncate py-2", device.failing && "text-muted-foreground line-through")}>
                    <Ltr>{label}</Ltr>
                    <span className="text-muted-foreground"> · {t("settings.push.since", { date: formatDate(device.createdAt, locale, { dateStyle: "medium" }) })}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={t("settings.push.remove", { device: label })}
                    onClick={() => removeDevice(device.id)}
                  >
                    <XIcon aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Row>
  );
}

// ─── Coming later ─────────────────────────────────────────────

function LaterRow() {
  const t = useTranslations("alerts");
  const format = useFormatter();
  return (
    <Row icon={MessageSquareIcon} title={format.list([t("channel.sms"), t("channel.whatsapp")], { type: "unit" })} tags={<SoonTag label={t("settings.paid")} />}>
      <p>{t("settings.later")}</p>
    </Row>
  );
}

// ─── Test ─────────────────────────────────────────────────────

function TestButton() {
  const t = useTranslations("alerts");
  const format = useFormatter();
  const router = useRouter();
  const errorText = useAlertError();
  const [pending, startTransition] = useTransition();
  const names = (channels: AlertChannel[]) => format.list(channels.map((c) => t(`channelShort.${c}`)), { type: "conjunction" });
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn(ACTION, "justify-self-start")}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await sendTestAlertAction();
          if (!result.ok) {
            toast.error(errorText(result.error));
            return;
          }
          const sent = result.data.results.filter((r) => r.accepted).map((r) => r.channel);
          const failed = result.data.results.filter((r) => !r.accepted).map((r) => r.channel);
          if (sent.length === 0 && failed.length === 0) toast.info(t("settings.testNone"));
          else if (sent.length > 0) toast.success(t("settings.testSent", { channels: names(sent) }));
          if (failed.length > 0) toast.error(t("settings.testNotSent", { channels: names(failed) }));
          router.refresh();
        })
      }
    >
      {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : <BellRingIcon aria-hidden />}
      {t("settings.test")}
    </Button>
  );
}
