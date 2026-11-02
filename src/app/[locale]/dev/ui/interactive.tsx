"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HomeIcon, MinusIcon, PhoneIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/common/brand-icons";
import {
  BottomSheet,
  Button,
  Chip,
  HeartButton,
  HebrewBubbleIcon,
  KosherStampIcon,
  NumberRoll,
  RemovableChip,
  SegmentedControl,
  ShabbatCandlesIcon,
  StickyContactBar,
  SynagogueIcon,
} from "@/components/ds";
import { Price } from "@/components/listing/price";

/** Interactive demos for the /dev/ui showcase (client side). */

type Deal = "short-stay" | "monthly" | "buy" | "hotels";
const DEALS: Deal[] = ["short-stay", "monthly", "buy", "hotels"];
const ROOMS = ["any", "1", "2", "3", "4", "5"] as const;

export function SegmentedDemo() {
  const tf = useTranslations("listingFields.dealFilter");
  const tc = useTranslations("common");
  const [deal, setDeal] = useState<Deal>("short-stay");
  const [rooms, setRooms] = useState<(typeof ROOMS)[number]>("any");
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <SegmentedControl
        aria-label={tc("filter")}
        value={deal}
        onValueChange={setDeal}
        options={DEALS.map((value) => ({ value, label: tf(value) }))}
      />
      <SegmentedControl
        aria-label={tc("filter")}
        tone="card"
        size="sm"
        value={rooms}
        onValueChange={setRooms}
        options={ROOMS.map((value) => ({ value, label: value === "any" ? tc("all") : `${value}+` }))}
      />
    </div>
  );
}

export function ChipsDemo() {
  const tb = useTranslations("ds.badges");
  const tc = useTranslations("common");
  const [on, setOn] = useState<Record<string, boolean>>({ kosher: true });
  const [removed, setRemoved] = useState(false);
  const toggle = (key: string) => setOn((s) => ({ ...s, [key]: !s[key] }));
  const active = Object.values(on).filter(Boolean).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip active={active > 0} count={active} icon={SlidersHorizontalIcon} aria-haspopup="dialog">
          {tc("filter")}
        </Chip>
        <Chip pressed={!!on.kosher} onClick={() => toggle("kosher")} icon={KosherStampIcon}>
          {tb("kosherKitchen")}
        </Chip>
        <Chip pressed={!!on.shabbat} onClick={() => toggle("shabbat")} icon={ShabbatCandlesIcon}>
          {tb("shabbatFriendly")}
        </Chip>
        <Chip pressed={!!on.synagogue} onClick={() => toggle("synagogue")} icon={SynagogueIcon}>
          {tb("synagogueWalk", { minutes: 10 })}
        </Chip>
        <Chip size="sm" pressed={!!on.hebrew} onClick={() => toggle("hebrew")} icon={HebrewBubbleIcon}>
          {tb("hebrew")}
        </Chip>
      </div>
      <div className="flex flex-wrap gap-2">
        {!removed && <RemovableChip onRemove={() => setRemoved(true)}>{tb("kosherKitchen")}</RemovableChip>}
        <RemovableChip size="sm" onRemove={() => setRemoved(false)} icon={HomeIcon}>
          {tb("welcomes")}
        </RemovableChip>
      </div>
    </div>
  );
}

export function HeartDemo() {
  const [saved, setSaved] = useState(false);
  const tc = useTranslations("common");
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-card bg-muted p-3">
        <HeartButton pressed={saved} onClick={() => setSaved(!saved)} label={tc("save")} />
      </div>
      <HeartButton pressed={saved} onClick={() => setSaved(!saved)} label={tc("save")} variant="outline" />
    </div>
  );
}

export function NumberRollDemo() {
  const t = useTranslations("ds.devUi");
  const [count, setCount] = useState(24);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="icon" aria-label="-7" onClick={() => setCount((n) => Math.max(0, n - 7))}>
        <MinusIcon />
      </Button>
      <Button size="lg">
        {/* One span: the button is a flex row, so loose text and the number would get gaps between them. */}
        <span>{t.rich("showResults", { count, n: () => <NumberRoll value={count} /> })}</span>
      </Button>
      <Button variant="outline" size="icon" aria-label="+13" onClick={() => setCount((n) => n + 13)}>
        <PlusIcon />
      </Button>
      <span className="text-h2">
        <NumberRoll value={count * 1250} />
      </span>
    </div>
  );
}

export function SheetDemo() {
  const t = useTranslations("ds.devUi");
  const tb = useTranslations("ds.badges");
  const tc = useTranslations("common");
  const tf = useTranslations("listingFields.dealFilter");
  const [open, setOpen] = useState(false);
  const [deal, setDeal] = useState<Deal>("short-stay");
  const [kosher, setKosher] = useState(false);
  const [shabbat, setShabbat] = useState(false);
  const count = 40 - (kosher ? 22 : 0) - (shabbat ? 11 : 0) - (deal === "buy" ? 9 : 0);
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title={tc("filter")}
      size="full"
      onClear={() => {
        setKosher(false);
        setShabbat(false);
        setDeal("short-stay");
      }}
      trigger={
        <Chip active={kosher || shabbat} count={(kosher ? 1 : 0) + (shabbat ? 1 : 0)} icon={SlidersHorizontalIcon}>
          {tc("filter")}
        </Chip>
      }
      footer={
        <div className="flex items-center gap-3">
          <Button variant="link" onClick={() => setOpen(false)}>
            {tc("clearAll")}
          </Button>
          <Button size="lg" className="flex-1" onClick={() => setOpen(false)}>
            <span>{t.rich("showResults", { count, n: () => <NumberRoll value={count} /> })}</span>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <SegmentedControl
          aria-label={tc("filter")}
          value={deal}
          onValueChange={setDeal}
          options={DEALS.map((value) => ({ value, label: tf(value) }))}
        />
        <div className="flex flex-wrap gap-2">
          <Chip pressed={kosher} onClick={() => setKosher(!kosher)} icon={KosherStampIcon}>
            {tb("kosherKitchen")}
          </Chip>
          <Chip pressed={shabbat} onClick={() => setShabbat(!shabbat)} icon={ShabbatCandlesIcon}>
            {tb("shabbatFriendly")}
          </Chip>
        </div>
        <p className="text-body text-muted-foreground">{t("sheetBody")}</p>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-16 rounded-input bg-muted" />
        ))}
      </div>
    </BottomSheet>
  );
}

export function ContactBarDemo() {
  const t = useTranslations("ds.devUi");
  const [shown, setShown] = useState(false);
  return (
    <div>
      <Button variant="soft" onClick={() => setShown(!shown)} aria-pressed={shown}>
        StickyContactBar
      </Button>
      {shown && (
        <StickyContactBar
          mobileOnly={false}
          price={<Price amount={450} currency="ILS" period="NIGHT" size="lg" />}
          primary={
            <Button variant="whatsapp">
              <WhatsAppIcon />
              WhatsApp
            </Button>
          }
          secondary={
            <Button variant="outline" size="icon" aria-label={t("showPhone")}>
              <PhoneIcon />
            </Button>
          }
        />
      )}
    </div>
  );
}
