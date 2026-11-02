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
