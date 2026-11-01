import type { ComponentType } from "react";
import {
  AccessibilityIcon,
  AirVentIcon,
  BabyIcon,
  BedDoubleIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  BuildingIcon,
  CalendarRangeIcon,
  CarIcon,
  CookingPotIcon,
  DoorOpenIcon,
  DumbbellIcon,
  FenceIcon,
  FlameIcon,
  HeaterIcon,
  HotelIcon,
  HouseIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LaptopIcon,
  LightbulbIcon,
  MailIcon,
  MessageSquareTextIcon,
  MountainIcon,
  MountainSnowIcon,
  PhoneIcon,
  SnowflakeIcon,
  SofaIcon,
  StoreIcon,
  SunIcon,
  ThermometerIcon,
  TimerIcon,
  TreePineIcon,
  TreesIcon,
  TvIcon,
  UsersIcon,
  WashingMachineIcon,
  WavesIcon,
  WifiIcon,
  WindIcon,
  ZapIcon,
  ScrollTextIcon,
  UtensilsCrossedIcon,
  CoffeeIcon,
  WineIcon,
  FootprintsIcon,
  DropletsIcon,
  ShowerHeadIcon,
  CastleIcon,
  ArrowUpDownIcon,
  ScanEyeIcon,
  type LucideProps,
} from "lucide-react";
import { MessengerIcon, TelegramIcon, ViberIcon, WhatsAppIcon } from "@/components/common/brand-icons";
import { HebrewBubbleIcon, KosherStampIcon, ShabbatCandlesIcon } from "@/components/ds/jewish-icons";
import type { DealType, PropertyType } from "@/generated/prisma/enums";
import type { ContactChannelKey } from "@/lib/listing/fields";

/** Icons for the listing vocabulary used in the wizard (Lucide only). */

type Icon = ComponentType<LucideProps>;

export const DEAL_ICONS: Record<DealType, Icon> = {
  SHORT_STAY: CalendarRangeIcon,
  MONTHLY_RENT: KeyRoundIcon,
  SALE: LandmarkIcon,
  HOTEL_ROOM: HotelIcon,
};

export const PROPERTY_ICONS: Record<PropertyType, Icon> = {
  APARTMENT: Building2Icon,
  STUDIO: SofaIcon,
  PENTHOUSE: BuildingIcon,
  HOUSE: HouseIcon,
  VILLA: CastleIcon,
  COTTAGE: TreePineIcon,
  ROOM: DoorOpenIcon,
  HOTEL: HotelIcon,
  GUESTHOUSE: StoreIcon,
  HOSTEL: BedDoubleIcon,
};

export const AMENITY_ICONS: Record<string, Icon> = {
  wifi: WifiIcon,
  air_conditioning: AirVentIcon,
  heating: HeaterIcon,
  washing_machine: WashingMachineIcon,
  dryer: WindIcon,
  dishwasher: DropletsIcon,
  full_kitchen: CookingPotIcon,
  workspace: LaptopIcon,
  tv: TvIcon,
  parking: CarIcon,
  balcony_terrace: SunIcon,
  yard: TreesIcon,
  pool: WavesIcon,
  sauna: ThermometerIcon,
  gym: DumbbellIcon,
  near_sea: WavesIcon,
  near_ski_lifts: MountainSnowIcon,
  crib_high_chair: BabyIcon,
  wheelchair_access: AccessibilityIcon,
  self_check_in: KeyRoundIcon,
};

export const SHABBAT_ICONS: Record<string, Icon> = {
  hot_plate: FlameIcon,
  hot_water_urn: CoffeeIcon,
  light_timers: TimerIcon,
  mechanical_key: KeyRoundIcon,
  stairs_or_shabbat_elevator: ArrowUpDownIcon,
  no_motion_sensors: LightbulbIcon,
};

export const JEWISH_ICONS: Record<string, Icon> = {
  mezuzot: ScrollTextIcon,
  separable_beds: BedDoubleIcon,
  sukkah_space: FenceIcon,
  pesach_ready: UtensilsCrossedIcon,
  kosher_food_nearby: KosherStampIcon,
  mikveh_nearby: ShowerHeadIcon,
  host_keeps_shabbat: ShabbatCandlesIcon,
  host_speaks_hebrew: HebrewBubbleIcon,
};

export const HOTEL_JEWISH_ICONS: Record<string, Icon> = {
  kosher_breakfast: CoffeeIcon,
  kosher_meals: KosherStampIcon,
  shabbat_meals: WineIcon,
  separate_swimming: WavesIcon,
};

export const HEATING_ICONS: Record<string, Icon> = {
  CENTRAL: HeaterIcon,
  GAS_BOILER: FlameIcon,
  ELECTRIC: ZapIcon,
  AIR_CONDITIONING: SnowflakeIcon,
};

export const VIEW_ICONS: Record<string, Icon> = {
  SEA: WavesIcon,
  MOUNTAIN: MountainIcon,
  CITY: Building2Icon,
};

/** Brand logos for the messengers (only next to that service), Lucide for the rest. */
export const CHANNEL_ICONS: Record<ContactChannelKey, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  WHATSAPP: WhatsAppIcon,
  TELEGRAM: TelegramIcon,
  VIBER: ViberIcon,
  MESSENGER: MessengerIcon,
  PHONE: PhoneIcon,
  SMS: MessageSquareTextIcon,
  EMAIL: MailIcon,
};

export { BriefcaseBusinessIcon, UsersIcon, FootprintsIcon, ScanEyeIcon };
