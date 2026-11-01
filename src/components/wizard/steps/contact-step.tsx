"use client";

import { useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownIcon, ArrowUpIcon, ClockIcon, EyeOffIcon, GripVerticalIcon, MoonStarIcon, PlusIcon, XIcon } from "lucide-react";
import { PhoneInput, type PhoneCountry } from "@/components/forms/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CONTACT_CHANNELS, type ContactChannelKey, type ContactMethod } from "@/lib/listing/fields";
import { listingContactDefaultCountry } from "@/lib/auth/phone-defaults";
import { cn } from "@/lib/utils";
import { parsePhoneNumber } from "react-phone-number-input";
import { normalizeContactValue, PHONE_CHANNELS } from "@/lib/wizard/schemas";
import { Field, FieldError, Section, TimeInput } from "../fields";
import { CHANNEL_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/** Listings whose empty contact list was pre-filled in this tab (only once). */
const prefilled = new Set<string>();

function MethodRow({
  method,
  index,
  total,
  error,
  onValue,
  onRemove,
  onMove,
  defaultPhone,
}: {
  method: ContactMethod;
  index: number;
  total: number;
  error: string | null | undefined;
  onValue: (value: string) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  defaultPhone: string | null;
}) {
  const t = useTranslations("wizard.contact");
  const label = useOptionLabel();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: method.channel,
  });
  const Icon = CHANNEL_ICONS[method.channel];
  const name = label("channel", method.channel);
  const isPhone = PHONE_CHANNELS.includes(method.channel);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid min-w-0 gap-3 rounded-xl border bg-card p-3 sm:p-4",
        isDragging ? "z-10 border-primary shadow-card-hover" : error ? "border-destructive/50" : "border-border",
      )}
    >
      {/* Wraps on narrow phones (long channel names in ru/ka): the move/remove buttons go to a second line. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle", { name })}
          aria-roledescription={t("sortable")}
          className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-[1_1_8rem] font-medium">
          {name}
          {index === 0 && <span className="ms-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{t("first")}</span>}
        </span>
        <div className="ms-auto flex shrink-0 items-center">
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t("moveUp", { name })}>
            <ArrowUpIcon aria-hidden />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={t("moveDown", { name })}>
            <ArrowDownIcon aria-hidden />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onRemove} aria-label={t("remove", { name })}>
            <XIcon aria-hidden />
          </Button>
        </div>
      </div>
      {isPhone ? (
        <PhoneInput
          value={method.value || undefined}
          // Most hosts have Georgian numbers: +995, unless their verified phone is from elsewhere.
          defaultCountry={listingContactDefaultCountry(phoneCountry(defaultPhone)) as PhoneCountry}
          rememberAs="listing-contact"
          onChange={(value) => onValue(value ?? "")}
          aria-label={t("valueLabel", { name })}
          error={error ?? null}
          description={defaultPhone && method.value === defaultPhone ? t("verifiedPhone") : undefined}
        />
      ) : (
        <Field
          label={t(`valueLabels.${method.channel}`)}
          error={error}
          description={method.channel === "EMAIL" ? t("emailHidden") : t(`valueHelp.${method.channel}`)}
        >
          {(props) => (
            <Input
              {...props}
              type={method.channel === "EMAIL" ? "email" : "text"}
              dir="ltr"
              autoComplete={method.channel === "EMAIL" ? "email" : "off"}
              value={method.value}
              placeholder={t(`placeholders.${method.channel}`)}
              onChange={(e) => onValue(e.target.value)}
              onBlur={(e) => onValue(normalizeContactValue(method.channel, e.target.value))}
              className="h-11 text-base"
            />
          )}
        </Field>
      )}
    </li>
  );
}

/** Step 9 — which contact methods to show, in which order, contact hours and Shabbat. */
export function ContactStep({ listing, context, values, set, errors }: StepProps) {
  const t = useTranslations("wizard.contact");
  const label = useOptionLabel();
  const methods = values.contactMethods;
  const enabled = new Set(methods.map((m) => m.channel));
  const available = CONTACT_CHANNELS.filter((c) => !enabled.has(c));
  const defaultPhone = context.user.phoneVerified ? context.user.phoneNumber : null;
  // A stable id keeps dnd-kit's aria-describedby the same on the server and the client.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setMethods = (next: ContactMethod[]) => set({ contactMethods: next.map((m, order) => ({ ...m, order })) });

  const defaultValue = (channel: ContactChannelKey): string => {
    if (PHONE_CHANNELS.includes(channel)) return defaultPhone ?? "";
    if (channel === "TELEGRAM") return defaultPhone ?? "";
    if (channel === "EMAIL") return context.user.email ?? "";
    return "";
  };

  // A new listing starts with WhatsApp and a phone call on the verified number.
  useEffect(() => {
    if (prefilled.has(listing.id)) return;
    prefilled.add(listing.id);
    if (listing.values.contactMethods.length === 0 && values.contactMethods.length === 0 && defaultPhone) {
      set({
        contactMethods: [
          { channel: "WHATSAPP", value: defaultPhone, order: 0 },
          { channel: "PHONE", value: defaultPhone, order: 1 },
        ],
      });
    }
    // Runs once per listing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = methods.map((m) => m.channel as string);
    setMethods(arrayMove(methods, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const position = (id: string | number) => methods.findIndex((m) => m.channel === id) + 1;

  return (
    <div className="grid gap-6">
      <Section title={t("methodsTitle")} description={t("methodsDescription")}>
        {methods.length > 0 ? (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{
              screenReaderInstructions: { draggable: t("dndInstructions") },
              announcements: {
                onDragStart: ({ active }) => t("dndStart", { position: position(active.id) }),
                onDragOver: ({ over }) => (over ? t("dndOver", { position: position(over.id) }) : undefined),
                onDragEnd: ({ over }) => (over ? t("dndEnd", { position: position(over.id) }) : t("dndCancel")),
                onDragCancel: () => t("dndCancel"),
              },
            }}
          >
            <SortableContext items={methods.map((m) => m.channel)} strategy={verticalListSortingStrategy}>
              <ol className="grid gap-3">
                {methods.map((method, index) => (
                  <MethodRow
                    key={method.channel}
                    method={method}
                    index={index}
                    total={methods.length}
                    error={errors[`contact.${method.channel}`]}
                    defaultPhone={defaultPhone}
                    onValue={(value) => setMethods(methods.map((m) => (m.channel === method.channel ? { ...m, value } : m)))}
                    onRemove={() => setMethods(methods.filter((m) => m.channel !== method.channel))}
                    onMove={(delta) => {
                      const to = index + delta;
                      if (to < 0 || to >= methods.length) return;
                      setMethods(arrayMove(methods, index, to));
                    }}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}
        {errors.contactMethods && <FieldError id="contact-methods-error">{errors.contactMethods}</FieldError>}

        {available.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">{t("add")}</p>
            <div className="flex flex-wrap gap-2">
              {available.map((channel) => {
                const Icon = CHANNEL_ICONS[channel];
                return (
                  <Button
                    key={channel}
                    type="button"
                    variant="outline"
                    className="h-10 rounded-full"
                    onClick={() => setMethods([...methods, { channel, value: defaultValue(channel), order: methods.length }])}
                  >
                    <PlusIcon className="size-3.5" aria-hidden />
                    <Icon aria-hidden />
                    {label("channel", channel)}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <EyeOffIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("privacyNote")}
        </p>
      </Section>

      <Section title={t("hoursTitle")} description={t("hoursDescription")} icon={ClockIcon}>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Field label={t("hoursFrom")} error={errors.contactHoursFrom}>
            {(props) => (
              <TimeInput {...props} value={values.contactHoursFrom} onChange={(contactHoursFrom) => set({ contactHoursFrom })} />
            )}
          </Field>
          <Field label={t("hoursTo")} error={errors.contactHoursTo}>
            {(props) => <TimeInput {...props} value={values.contactHoursTo} onChange={(contactHoursTo) => set({ contactHoursTo })} />}
          </Field>
        </div>
        <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3.5">
          <span className="flex items-start gap-3">
            <MoonStarIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t("noShabbat")}</span>
              <span className="text-xs text-muted-foreground">{t("noShabbatHelp")}</span>
            </span>
          </span>
          <Switch checked={values.noReplyOnShabbat} onCheckedChange={(noReplyOnShabbat) => set({ noReplyOnShabbat })} />
        </label>
      </Section>
    </div>
  );
}

/** "IL" for "+972…" (the owner's verified phone), or null. */
function phoneCountry(phone: string | null | undefined): string | null {
  if (!phone) return null;
  try {
    return parsePhoneNumber(phone)?.country ?? null;
  } catch {
    return null;
  }
}
