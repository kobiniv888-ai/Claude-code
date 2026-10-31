/**
 * Lucide icons for the listing vocabulary (keys from @/lib/listing/fields). Use them next to
 * the labels from messages/<locale>/listingFields.json:
 *
 *   const Icon = fieldIcon("amenity", "wifi");
 *   <Icon className="size-4" aria-hidden /> {t(`amenity.wifi`)}
 */
import type { ComponentType } from "react";
import {
  AccessibilityIcon,
  AirVentIcon,
  ArrowUpDownIcon,
  BabyIcon,
  BedDoubleIcon,
  Building2Icon,
  BuildingIcon,
  CalendarRangeIcon,
  CarIcon,
  CastleIcon,
  CheckIcon,
  CigaretteIcon,
  CoffeeIcon,
  ConstructionIcon,
  CookingPotIcon,
  DoorOpenIcon,
  DropletsIcon,
  DumbbellIcon,
  FlameIcon,
  FrameIcon,
  HammerIcon,
  HeaterIcon,
  HotelIcon,
  HouseIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LanguagesIcon,
  LaptopIcon,
  LightbulbOffIcon,
  MoonStarIcon,
  MountainIcon,
  MountainSnowIcon,
  PaintRollerIcon,
  PawPrintIcon,
  ScrollTextIcon,
  ShoppingBasketIcon,
  SnowflakeIcon,
  SofaIcon,
  SparklesIcon,
  SplitIcon,
  StoreIcon,
  SunIcon,
  TentIcon,
  ThermometerSunIcon,
  TimerIcon,
  TreePineIcon,
  TreesIcon,
  TvIcon,
  UtensilsCrossedIcon,
  WashingMachineIcon,
  WavesIcon,
  WavesLadderIcon,
  WifiIcon,
  WindIcon,
  WineIcon,
  WrenchIcon,
  ZapIcon,
  type LucideProps,
} from "lucide-react";
import type {
  DealType,
  HeatingType,
  KitchenKosher,
  PropertyCondition,
  PropertyType,
  ViewType,
} from "@/generated/prisma/enums";
import type { Amenity, HotelJewishFeature, JewishFeature, ShabbatFeature } from "@/lib/listing/fields";

export type FieldIcon = ComponentType<LucideProps>;

export const DEAL_TYPE_ICONS: Record<DealType, FieldIcon> = {
  SHORT_STAY: CalendarRangeIcon,
  MONTHLY_RENT: KeyRoundIcon,
  SALE: LandmarkIcon,
  HOTEL_ROOM: HotelIcon,
};

export const PROPERTY_TYPE_ICONS: Record<PropertyType, FieldIcon> = {
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

export const AMENITY_ICONS: Record<Amenity, FieldIcon> = {
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
  pool: WavesLadderIcon,
  sauna: ThermometerSunIcon,
  gym: DumbbellIcon,
  near_sea: WavesIcon,
  near_ski_lifts: MountainSnowIcon,
  crib_high_chair: BabyIcon,
  wheelchair_access: AccessibilityIcon,
  self_check_in: KeyRoundIcon,
};

export const HOUSE_RULE_ICONS: Record<"pets_allowed" | "smoking_allowed", FieldIcon> = {
  pets_allowed: PawPrintIcon,
  smoking_allowed: CigaretteIcon,
};

export const SHABBAT_FEATURE_ICONS: Record<ShabbatFeature, FieldIcon> = {
  hot_plate: FlameIcon,
  hot_water_urn: CoffeeIcon,
  light_timers: TimerIcon,
  mechanical_key: KeyRoundIcon,
  stairs_or_shabbat_elevator: ArrowUpDownIcon,
  no_motion_sensors: LightbulbOffIcon,
};

export const JEWISH_FEATURE_ICONS: Record<JewishFeature, FieldIcon> = {
  mezuzot: ScrollTextIcon,
  separable_beds: SplitIcon,
  sukkah_space: TentIcon,
  pesach_ready: SparklesIcon,
  kosher_food_nearby: ShoppingBasketIcon,
  mikveh_nearby: DropletsIcon,
  host_keeps_shabbat: MoonStarIcon,
  host_speaks_hebrew: LanguagesIcon,
};

export const HOTEL_JEWISH_FEATURE_ICONS: Record<HotelJewishFeature, FieldIcon> = {
  kosher_breakfast: CoffeeIcon,
  kosher_meals: UtensilsCrossedIcon,
  shabbat_meals: WineIcon,
  separate_swimming: WavesLadderIcon,
};

export const KITCHEN_KOSHER_ICONS: Record<KitchenKosher, FieldIcon> = {
  NOT_KOSHER: CookingPotIcon,
  CAN_KASHER: SparklesIcon,
  KOSHER: UtensilsCrossedIcon,
};

export const CONDITION_ICONS: Record<PropertyCondition, FieldIcon> = {
  BLACK_FRAME: ConstructionIcon,
  WHITE_FRAME: FrameIcon,
  GREEN_FRAME: PaintRollerIcon,
  NEWLY_RENOVATED: SparklesIcon,
  OLD_RENOVATION: WrenchIcon,
  NEEDS_RENOVATION: HammerIcon,
};

export const HEATING_ICONS: Record<HeatingType, FieldIcon> = {
  CENTRAL: HeaterIcon,
  GAS_BOILER: FlameIcon,
  ELECTRIC: ZapIcon,
  AIR_CONDITIONING: SnowflakeIcon,
};

export const VIEW_ICONS: Record<ViewType, FieldIcon> = {
  SEA: WavesIcon,
  MOUNTAIN: MountainIcon,
  CITY: Building2Icon,
};

/** Icon groups, named like the groups in listingFields.json. */
export const FIELD_ICONS = {
  dealType: DEAL_TYPE_ICONS,
  propertyType: PROPERTY_TYPE_ICONS,
  amenity: AMENITY_ICONS,
  houseRule: HOUSE_RULE_ICONS,
  shabbatFeature: SHABBAT_FEATURE_ICONS,
  jewishFeature: JEWISH_FEATURE_ICONS,
  hotelJewishFeature: HOTEL_JEWISH_FEATURE_ICONS,
  kitchenKosher: KITCHEN_KOSHER_ICONS,
  condition: CONDITION_ICONS,
  heating: HEATING_ICONS,
  view: VIEW_ICONS,
} as const;

export type FieldIconGroup = keyof typeof FIELD_ICONS;

/** The icon for a key (a check mark for keys the vocabulary does not know). */
export function fieldIcon(group: FieldIconGroup, key: string): FieldIcon {
  return (FIELD_ICONS[group] as Record<string, FieldIcon>)[key] ?? CheckIcon;
}

/** Icon for an amenity filter key: amenities plus pets_allowed / smoking_allowed. */
export function amenityFilterIcon(key: string): FieldIcon {
  return (AMENITY_ICONS as Record<string, FieldIcon>)[key] ?? (HOUSE_RULE_ICONS as Record<string, FieldIcon>)[key] ?? CheckIcon;
}
