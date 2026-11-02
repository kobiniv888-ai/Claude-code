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
