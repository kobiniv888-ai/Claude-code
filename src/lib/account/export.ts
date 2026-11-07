import "server-only";
import { siteConfig } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { siteUrl } from "@/lib/site-url";
import { db } from "@/lib/db";
import { isPlaceholderEmail } from "@/lib/email";
import { absoluteMediaUrl, photoUrl } from "@/lib/media";
import { bookingPriceLines } from "@/lib/booking/price-lines";

/**
 * "Download my data" (GDPR / Israeli privacy law / Georgian personal data law): everything we
 * keep about the user, as plain JSON. Never includes verification documents (only their status),
 * staff-internal ticket notes, staff-only visit notes ("ביקרנו במקום": the note and who entered
 * it; the visit date is the host's public badge and stays), other users' personal data (a host's
 * export has its bookings without the guests' names, phones or messages), secrets (2-step key,
 * iCal token) or internal anti-fraud data (scores, report counters).
 */

const MAX_ROWS = 5000;

export const EXPORT_FORMAT_VERSION = 1;

/**
 * Every Listing column, and whether the owner's export carries it (`false` = never read). An
 * allowlist typed against the schema: a new column fails the type check until someone decides
 * here, so a staff-only column can't slip into the export by default (as `omit` would let it).
 */
export const LISTING_EXPORT_COLUMNS = {
  id: true,
  publicId: true,
  ownerId: true,
  status: true,
  wizardStep: true,
  dealType: true,
  propertyType: true,
  countryCode: true,
  cityId: true,
  neighborhoodId: true,
  address: true,
  lat: true,
  lng: true,
  approxLat: true,
  approxLng: true,
  originalLocale: true,
  title: true,
  description: true,
  searchText: false, // search index
  rooms: true,
  bedrooms: true,
  bathrooms: true,
  bedsSingle: true,
  bedsDouble: true,
  bedsSofa: true,
  maxGuests: true,
  sizeSqm: true,
  floor: true,
  totalFloors: true,
  elevator: true,
  yearBuilt: true,
  buildingAge: true,
  furnished: true,
  condition: true,
  heating: true,
  views: true,
  cadastralCode: true,
  amenities: true,
  kitchenKosher: true,
  shabbatFeatures: true,
  jewishFeatures: true,
  isShabbatFriendly: true,
  kosherCertName: true,
  kosherCertPhotoKey: false, // a private storage key
  hotelJewishFeatures: true,
  sharedRoomFor: true,
  synagogueWalkMin: true,
  chabadWalkMin: true,
  nearby: false, // cached place data, not the user's
  nearbyUpdatedAt: true,
  price: true,
  currency: true,
  pricePeriod: true,
  priceUsd: true,
  pricePerSqmUsd: true,
  previousPrice: true,
  priceDroppedAt: true,
  deposit: true,
  cleaningFee: true,
  utilitiesIncluded: true,
  utilitiesEstimate: true,
  minStayNights: true,
  weeklyDiscountPct: true,
  monthlyDiscountPct: true,
  bookingMode: true,
  weekendPrice: true,
  cancellationPolicy: true,
  paymentMethodsAtCheckIn: true,
  checkInFrom: true,
  checkOutUntil: true,
  checkInFlexible: true,
  checkOutFlexible: true,
  smokingAllowed: true,
  petsAllowed: true,
  partiesAllowed: true,
  quietHoursFrom: true,
  quietHoursTo: true,
  videoUrl: true,
  tour360Url: true,
  contactMethods: true,
  contactHoursFrom: true,
  contactHoursTo: true,
  noReplyOnShabbat: true,
  icalToken: false, // a secret
  icalImportUrls: true,
  icalSyncedAt: true,
  viewCount: true,
  contactCount: true,
  saveCount: true,
  reportCount: false, // internal anti-fraud counter
  riskScore: false, // internal anti-fraud score
  riskReasons: false,
  lastCheckedAt: true,
  moderationReason: true, // shown to the owner
  moderationNote: true, // shown to the owner
  reviewedAt: true,
  reviewedById: false, // a staff member
  ownerVerifiedAt: true,
  propertyVerifiedAt: true,
  rulesAcceptedAt: true,
  welcomePledgeVersion: true,
  welcomePledgeAt: true,
  visitedAt: true, // the public "ביקרנו במקום" badge
  visitedNote: false, // STAFF ONLY (brief 8.3)
  visitedById: false, // STAFF ONLY (brief 8.3)
  publishedAt: true,
  expiresAt: true,
  expiryWarnedAt: true,
  renewedAt: true,
  bumpedAt: true,
  featuredUntil: true,
  contentUpdatedAt: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const satisfies Record<Prisma.ListingScalarFieldEnum, boolean>;

/** The booking fields both sides may see (docs/redesign-2/booking.md). */
const BOOKING_EXPORT_SELECT = {
  code: true,
  listing: { select: { publicId: true, title: true } },
  roomTypeName: true,
  checkIn: true,
  checkOut: true,
  nights: true,
  adults: true,
  children: true,
  infants: true,
  nightlyPrice: true,
  weekendPrice: true,
  subtotal: true,
  cleaningFee: true,
  discount: true,
  total: true,
  currency: true,
  rooms: true,
  priceLines: true,
  cancellationPolicy: true,
  paymentMethods: true,
  status: true,
  cancelReasonCode: true,
  cancelledAt: true,
  noShowReportedAt: true,
  rulesAcceptedAt: true,
  createdAt: true,
} as const;

/**
 * A booking as plain JSON: dates as days, money as numbers, the listing by its public number, and
 * the itemized total (round 3, phase 4: the nights, holiday prices, the long-stay discount, the
 * cleaning fee, the rooms booked), rebuilt for bookings made before the lines were stored.
 */
function exportBooking(row: {
  listing: { publicId: number; title: string };
  checkIn: Date;
  checkOut: Date;
  nights: number;
  nightlyPrice: unknown;
  weekendPrice: unknown;
  subtotal: unknown;
  cleaningFee: unknown;
  discount: unknown;
  total: unknown;
  rooms: number;
  priceLines: unknown;
}) {
  const { listing, checkIn, checkOut, nightlyPrice, weekendPrice, subtotal, cleaningFee, discount, total, priceLines, ...rest } = row;
  const money = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  const days = { checkIn: checkIn.toISOString().slice(0, 10), checkOut: checkOut.toISOString().slice(0, 10) };
  return {
    ...rest,
    listingId: listing.publicId,
    listingTitle: listing.title,
    ...days,
    nightlyPrice: money(nightlyPrice),
    weekendPrice: money(weekendPrice),
    subtotal: money(subtotal),
    cleaningFee: money(cleaningFee),
    discount: money(discount),
    total: money(total),
    priceLines: bookingPriceLines({
      ...days,
      nights: row.nights,
      nightlyPrice: money(nightlyPrice) ?? 0,
      weekendPrice: money(weekendPrice),
      subtotal: money(subtotal) ?? 0,
      cleaningFee: money(cleaningFee) ?? 0,
      discount: money(discount),
      total: money(total) ?? 0,
      rooms: row.rooms,
      priceLines,
    }),
  };
}

export async function buildAccountExport(userId: string) {
  const [user, listings, favorites, tickets, reports, contactClicks, verifications, sessions, tripsAsGuest, bookingsAsHost, recentlyViewed] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        firstName: true,
        email: true,
        contactEmail: true,
        emailVerified: true,
        image: true,
        phoneNumber: true,
        phoneNumberVerified: true,
        role: true,
        status: true,
        accountType: true,
        businessName: true,
        bio: true,
        spokenLanguages: true,
        locale: true,
        currency: true,
        timezone: true,
        keepsShabbat: true,
        showHebrewDates: true,
        notificationPrefs: true,
        twoFactorEnabled: true,
        idVerifiedAt: true,
        businessVerifiedAt: true,
        safetyTipSeenAt: true,
        welcomePledgeVersion: true,
        welcomePledgeAcceptedAt: true,
        createdAt: true,
        updatedAt: true,
        accounts: { select: { providerId: true, createdAt: true } },
      },
    }),
    db.listing.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: {
        ...LISTING_EXPORT_COLUMNS,
        city: { select: { slug: true } },
        neighborhood: { select: { slug: true } },
        translations: { select: { locale: true, title: true, description: true, isAuto: true, editedByOwner: true, updatedAt: true } },
        photos: { orderBy: { sortOrder: "asc" }, select: { url: true, storageKey: true, alt: true, isCover: true, sortOrder: true, room: true, roomTypeId: true } },
        // Each room type's calendar feed token is a secret, like the listing's own (icalToken).
        roomTypes: { omit: { listingId: true, icalToken: true } },
        datePrices: { orderBy: { startDate: "asc" }, omit: { listingId: true } },
        priceChanges: { orderBy: { changedAt: "asc" }, omit: { listingId: true } },
        availability: { orderBy: { startDate: "asc" }, omit: { listingId: true } },
      },
    }),
    db.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: { note: true, createdAt: true, listing: { select: { publicId: true, title: true } } },
    }),
    db.ticket.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: {
        number: true,
        category: true,
        priority: true,
        status: true,
        subject: true,
        locale: true,
        rating: true,
        ratingComment: true,
        createdAt: true,
        closedAt: true,
        listing: { select: { publicId: true } },
        messages: {
          where: { internal: false },
          orderBy: { createdAt: "asc" },
          select: { fromStaff: true, body: true, attachments: true, createdAt: true },
        },
      },
    }),
    db.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: {
        targetType: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        handledAt: true,
        listing: { select: { publicId: true } },
      },
    }),
    db.contactClick.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: { channel: true, createdAt: true, listing: { select: { publicId: true } } },
    }),
    db.verificationRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        type: true,
        status: true,
        cadastralCode: true,
        userNote: true,
        decisionReason: true,
        createdAt: true,
        reviewedAt: true,
        documentsDeletedAt: true,
        listing: { select: { publicId: true } },
      },
    }),
    db.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    }),
    // Bookings: everything about the user's own trips; for their places, the stay and money but
    // not the guest's name, phone or message (another person's data).
    db.booking.findMany({
      where: { guestUserId: userId },
      orderBy: { checkIn: "desc" },
      take: MAX_ROWS,
      select: { ...BOOKING_EXPORT_SELECT, guestName: true, guestPhone: true, messageToHost: true, cancelReason: true, cancelledById: true },
    }),
    db.booking.findMany({
      where: { hostUserId: userId },
      orderBy: { checkIn: "desc" },
      take: MAX_ROWS,
      select: { ...BOOKING_EXPORT_SELECT, cancelReason: true, cancelledById: true },
    }),
    // "נצפו לאחרונה" kept in the account (round 3, src/lib/recently-viewed).
    db.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: "desc" },
      take: MAX_ROWS,
      select: { viewedAt: true, listing: { select: { publicId: true, title: true } } },
    }),
  ]);

  const { accounts, ...profile } = user;
  return {
    format: EXPORT_FORMAT_VERSION,
    site: siteConfig.name,
    siteUrl: siteUrl(),
    exportedAt: new Date().toISOString(),
    profile: {
      ...profile,
      email: isPlaceholderEmail(profile.email) ? null : profile.email,
      image: profile.image ? absoluteMediaUrl(profile.image) : null,
    },
    connectedAccounts: accounts.map((a) => ({ provider: a.providerId, connectedAt: a.createdAt })),
    listings: listings.map(({ photos, city, neighborhood, ...listing }) => ({
      ...listing,
      city: city?.slug ?? null,
      neighborhood: neighborhood?.slug ?? null,
      photos: photos.map((p) => ({
        url: absoluteMediaUrl(photoUrl(p, "lg")),
        alt: p.alt,
        isCover: p.isCover,
        order: p.sortOrder,
      })),
    })),
    favorites: favorites.map((f) => ({
      listingId: f.listing.publicId,
      listingTitle: f.listing.title,
      note: f.note,
      savedAt: f.createdAt,
    })),
    recentlyViewed: recentlyViewed.map((r) => ({
      listingId: r.listing.publicId,
      listingTitle: r.listing.title,
      viewedAt: r.viewedAt,
    })),
    tickets: tickets.map(({ listing, messages, ...ticket }) => ({
      ...ticket,
      listingId: listing?.publicId ?? null,
      messages: messages.map((m) => ({
        from: m.fromStaff ? "support" : "you",
        body: m.body,
        attachments: Array.isArray(m.attachments)
          ? m.attachments.map((a) => (a && typeof a === "object" && "name" in a ? (a as { name?: unknown }).name ?? null : null))
          : [],
        sentAt: m.createdAt,
      })),
    })),
    reportsMade: reports.map(({ listing, ...report }) => ({ ...report, listingId: listing?.publicId ?? null })),
    contactClicks: contactClicks.map((c) => ({ listingId: c.listing.publicId, channel: c.channel, at: c.createdAt })),
    verificationRequests: verifications.map(({ listing, ...request }) => ({ ...request, listingId: listing?.publicId ?? null })),
    sessions,
    trips: tripsAsGuest.map(({ cancelledById, ...booking }) => ({
      ...exportBooking(booking),
      cancelledBy: booking.cancelledAt ? (cancelledById === userId ? "you" : "host") : null,
    })),
    bookingsOfMyPlaces: bookingsAsHost.map(({ cancelledById, cancelReason, ...booking }) => ({
      ...exportBooking(booking),
      cancelledBy: booking.cancelledAt ? (cancelledById === userId ? "you" : "guest") : null,
      // Only the host's own words; a guest's reason is the guest's data.
      cancelReason: cancelledById === userId ? cancelReason : null,
    })),
  };
}

export type AccountExport = Awaited<ReturnType<typeof buildAccountExport>>;
