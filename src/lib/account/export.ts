import "server-only";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { isPlaceholderEmail } from "@/lib/email";
import { absoluteMediaUrl, photoUrl } from "@/lib/media";

/**
 * "Download my data" (GDPR / Israeli privacy law / Georgian personal data law): everything we
 * keep about the user, as plain JSON. Never includes verification documents (only their status),
 * staff-internal ticket notes, other users' personal data (a host's export has its bookings
 * without the guests' names, phones or messages), secrets (2-step key, iCal token) or internal
 * anti-fraud scores.
 */

const MAX_ROWS = 5000;

export const EXPORT_FORMAT_VERSION = 1;

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
  total: true,
  currency: true,
  cancellationPolicy: true,
  paymentMethods: true,
  status: true,
  cancelReasonCode: true,
  cancelledAt: true,
  noShowReportedAt: true,
  rulesAcceptedAt: true,
  createdAt: true,
} as const;

/** A booking as plain JSON: dates as days, money as numbers, the listing by its public number. */
function exportBooking(row: {
  listing: { publicId: number; title: string };
  checkIn: Date;
  checkOut: Date;
  nightlyPrice: unknown;
  weekendPrice: unknown;
  subtotal: unknown;
  cleaningFee: unknown;
  total: unknown;
}) {
  const { listing, checkIn, checkOut, nightlyPrice, weekendPrice, subtotal, cleaningFee, total, ...rest } = row;
  const money = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    ...rest,
    listingId: listing.publicId,
    listingTitle: listing.title,
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
    nightlyPrice: money(nightlyPrice),
    weekendPrice: money(weekendPrice),
    subtotal: money(subtotal),
    cleaningFee: money(cleaningFee),
    total: money(total),
  };
}

export async function buildAccountExport(userId: string) {
  const [user, listings, favorites, tickets, reports, contactClicks, verifications, sessions, tripsAsGuest, bookingsAsHost] = await Promise.all([
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
      omit: {
        searchText: true,
        icalToken: true,
        riskScore: true,
        riskReasons: true,
        reviewedById: true,
        nearby: true,
        kosherCertPhotoKey: true,
      },
      include: {
        city: { select: { slug: true } },
        neighborhood: { select: { slug: true } },
        translations: { select: { locale: true, title: true, description: true, isAuto: true, editedByOwner: true, updatedAt: true } },
        photos: { orderBy: { sortOrder: "asc" }, select: { url: true, storageKey: true, alt: true, isCover: true, sortOrder: true } },
        roomTypes: { omit: { listingId: true } },
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
  ]);

  const { accounts, ...profile } = user;
  return {
    format: EXPORT_FORMAT_VERSION,
    site: siteConfig.name,
    siteUrl: siteConfig.url,
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
