-- Runs before every scripted "prisma db push" (.devcontainer/*.sh, scripts/vercel-build.mjs).
--
-- Round 2, phase 4 (booking) added AvailabilityBlock."bookingId" with a unique index. On a
-- database that already has the AvailabilityBlock table, "prisma db push" stops and asks for
-- --accept-data-loss before adding that index (it can't tell the column is new and empty), so a
-- non-interactive push fails. Adding the new, empty column and its index first loses nothing and
-- lets the push go through without that flag. Safe to run any number of times; does nothing on a
-- new database (the push then creates everything).
DO $$
BEGIN
  IF to_regclass('public."AvailabilityBlock"') IS NOT NULL THEN
    ALTER TABLE "AvailabilityBlock" ADD COLUMN IF NOT EXISTS "bookingId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilityBlock_bookingId_key" ON "AvailabilityBlock"("bookingId");
  END IF;
END $$;

-- Round 2, phase 5 (brief 5.9): JewishPlace gains "verifiedAt", "verifiedById" and "source", and
-- walking times on real listings may only come from verified, active, non-demo places
-- (src/lib/nearby.ts). The new columns are nullable, so the push itself needs no flag; adding them
-- here first lets the clean-up below run on the first push. The clean-up removes walking times a
-- real listing got from a place that is not (or no longer) verified, so a stale tag never shows;
-- they come back when an admin verifies a place nearby (its save recomputes listings within 5 km)
-- or the listing is published or moved again. Idempotent: once no real listing points to an
-- unverified place, the UPDATE changes nothing.
DO $$
BEGIN
  IF to_regclass('public."JewishPlace"') IS NOT NULL THEN
    ALTER TABLE "JewishPlace" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
    ALTER TABLE "JewishPlace" ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;
    ALTER TABLE "JewishPlace" ADD COLUMN IF NOT EXISTS "source" TEXT;
    IF to_regclass('public."Listing"') IS NOT NULL THEN
      UPDATE "Listing" AS l
      SET "synagogueWalkMin" = NULL,
          "chabadWalkMin" = NULL,
          "nearby" = l."nearby" - 'synagogue' - 'chabad' - 'kosherFood' - 'mikveh'
      WHERE l."isDemo" = false
        AND jsonb_typeof(l."nearby") = 'object'
        AND EXISTS (
          SELECT 1 FROM "JewishPlace" AS p
          WHERE p."id" IN (
              l."nearby" -> 'synagogue' ->> 'id',
              l."nearby" -> 'chabad' ->> 'id',
              l."nearby" -> 'kosherFood' ->> 'id',
              l."nearby" -> 'mikveh' ->> 'id'
            )
            AND (p."verifiedAt" IS NULL OR p."isDemo" OR NOT p."active")
        );
    END IF;
  END IF;
END $$;

-- Round 3, phase 1 ("country-ready"): JewishPlace gains "countryCode" (default 'GE', like City and
-- Listing). Adding it here first lets the push go through without a prompt, and a place that has a
-- city takes its city's country (the admin place form keeps them in step from now on). Idempotent:
-- once every place matches its city, the UPDATE changes nothing.
DO $$
BEGIN
  IF to_regclass('public."JewishPlace"') IS NOT NULL THEN
    ALTER TABLE "JewishPlace" ADD COLUMN IF NOT EXISTS "countryCode" TEXT NOT NULL DEFAULT 'GE';
    CREATE INDEX IF NOT EXISTS "JewishPlace_countryCode_idx" ON "JewishPlace"("countryCode");
    IF to_regclass('public."City"') IS NOT NULL THEN
      UPDATE "JewishPlace" AS p
      SET "countryCode" = c."countryCode"
      FROM "City" AS c
      WHERE p."cityId" = c."id" AND p."countryCode" IS DISTINCT FROM c."countryCode";
    END IF;
  END IF;
END $$;

-- Round 3, phase 1 (booking alerts, src/lib/alerts): User gains "telegramChatId" with a unique
-- index (and "telegramLinkedAt"). On a database that already has users, "prisma db push" stops and
-- asks for --accept-data-loss before adding a unique index to an existing table. The column is new
-- and empty, so adding it and its index first loses nothing and lets the push go through.
-- Idempotent.
DO $$
BEGIN
  IF to_regclass('public."User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkedAt" TIMESTAMP(3);
    CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramChatId_key" ON "User"("telegramChatId");
  END IF;
END $$;

-- Round 3, phase 3 (admin panel, turned-away reports, visited badge, reference prices) needs no
-- step here: new enum values, new nullable or defaulted columns, plain (non-unique) indexes, a
-- nullable foreign key and the new ReferencePrice table all push without --accept-data-loss
-- (checked on copies of a phase-2 database with data).

-- Round 3, phase 4 (hotels booked per room type): RoomType."quantity" ("כמה חדרים כאלה להציע
-- בבית") becomes required with default 1, and RoomType gains "icalToken" with a unique index.
-- "prisma db push" would stop on both on a database that has room types: it refuses to make a
-- column with NULLs required, and asks for --accept-data-loss before adding a unique index to an
-- existing table. Here a room type without a number of rooms gets 1 (the approved default), the
-- column takes the default and NOT NULL, and the new, empty "icalToken" column and its index are
-- added first, so the push goes through without a prompt and loses nothing. Values of 1 or more
-- are left as they are. Every other phase-4 change (DatePrice, PhotoRoom, Booking."rooms" /
-- "priceLines" / "discount", the other RoomType and AvailabilityBlock columns) is new and
-- nullable or defaulted, so the push adds it by itself. Idempotent.
DO $$
BEGIN
  IF to_regclass('public."RoomType"') IS NOT NULL THEN
    ALTER TABLE "RoomType" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;
    UPDATE "RoomType" SET "quantity" = 1 WHERE "quantity" IS NULL;
    ALTER TABLE "RoomType" ALTER COLUMN "quantity" SET DEFAULT 1;
    ALTER TABLE "RoomType" ALTER COLUMN "quantity" SET NOT NULL;
    ALTER TABLE "RoomType" ADD COLUMN IF NOT EXISTS "icalToken" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "RoomType_icalToken_key" ON "RoomType"("icalToken");
  END IF;
END $$;

-- Round 3, phase 5 (reviews, saved lists, saved searches, sea and ski walking times):
-- Report."reviewId" gets its foreign key to the new Review table (ON DELETE SET NULL). Until now it
-- was a plain column, so a report can hold an id that points to no review (there was no Review
-- table), and adding the key would then fail. Such ids become NULL first; the report itself stays,
-- with its target type, reason, text and status, the same state as a review report whose review
-- was removed later. Every other phase-5 change (the new Review, SavedList and SavedSearch tables
-- with their unique indexes, the nullable or defaulted Listing and Favorite columns, the plain
-- indexes and the other new foreign keys, whose columns are new) is pushed without a prompt by
-- itself. Idempotent: once the key exists no report can point nowhere, and the UPDATE changes
-- nothing. Skipped on a database whose Report table has no "reviewId" yet (the push adds it).
DO $$
DECLARE
  cleared integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Report' AND column_name = 'reviewId'
  ) THEN
    IF to_regclass('public."Review"') IS NULL THEN
      UPDATE "Report" SET "reviewId" = NULL WHERE "reviewId" IS NOT NULL;
    ELSE
      UPDATE "Report" AS r
      SET "reviewId" = NULL
      WHERE r."reviewId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Review" AS v WHERE v."id" = r."reviewId");
    END IF;
    GET DIAGNOSTICS cleared = ROW_COUNT;
    IF cleared > 0 THEN
      RAISE NOTICE 'before-push: % report(s) pointed to no review; their reviewId is now NULL', cleared;
    END IF;
  END IF;
END $$;

-- Security round (SECURITY_REPORT D2, 8 November 2026): Booking gains "idempotencyKey" with a
-- unique index per guest (the double-tap guard). On an existing Booking table "prisma db push"
-- would ask before adding a unique index; the new column is empty (NULLs never collide), so adding
-- both here first loses nothing and lets the push run without a prompt. Idempotent.
DO $$
BEGIN
  IF to_regclass('public."Booking"') IS NOT NULL THEN
    ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "Booking_guestUserId_idempotencyKey_key" ON "Booking"("guestUserId", "idempotencyKey");
  END IF;
END $$;
