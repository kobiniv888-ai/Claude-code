# Field encryption: exact addresses, pins and guest phones

SECURITY_REPORT row 12.3.c, founder's decision D7 (a) (8 November 2026). Code:
`src/lib/field-crypto-core.ts` (pure: format, keys, seal/open), `src/lib/field-crypto.ts` (the one
server module every read and write goes through), `src/lib/field-crypto-migrate.ts` +
`scripts/encrypt-fields.ts` (moving old rows, key rotation, the database guard).

## What is encrypted

| Column | Holds | Purpose bound into the ciphertext |
|---|---|---|
| `Listing.addressEnc` | the exact address line the owner typed (street, number, entrance, apartment) | `listing.address` |
| `Listing.pinEnc` | the exact pin, `"lat,lng"` with 6 decimals | `listing.pin` |
| `Booking.guestPhoneEnc` | the guest's verified phone on the booking (E.164) | `booking.guestPhone` |
| `Booking.guestPhoneLookup` | an HMAC of that phone, so the 2-upcoming-bookings-per-phone cap (decision 8) and an ADMIN phone search can find bookings without the number in plain text | (lookup) |

Not encrypted, on purpose: the public, moved map point (`Listing.approxLat/approxLng`, used by
search and maps), the city and neighbourhood, the walking times (rounded on the server). Account
emails and phones (`User.email`, `User.phoneNumber`) get HMAC lookups and encryption **after
launch** (D7 (a)); they are not part of this step.

The old plain columns (`Listing.address/lat/lng`, `Booking.guestPhone`; Prisma fields `legacy*`)
are empty, never read and never written. The database refuses values in them with two CHECK
constraints, `Listing_no_plain_location` and `Booking_no_plain_guest_phone`, which
`npm run db:encrypt-fields` adds once no plain value is left. A later release drops the columns
(see the end of this page). `tests/unit/field-encryption-guard.test.ts` keeps it that way.

The copy of each booking email kept in the admin email outbox (`EmailOutbox`) has the decrypted
address and guest phone masked (`src/lib/booking/notify.ts`): the email itself carries them, the
database log does not.

## Format

```
fe1:<key id>:<base64url(IV 12 bytes ‖ GCM tag 16 bytes ‖ ciphertext)>      encrypted value
fl1:<key id>:<base64url(HMAC-SHA256)>                                      lookup value
```

- AES-256-GCM, a fresh random IV per value (the same address never looks the same twice).
- `fe1` is the format version: a future format gets a new prefix and old rows keep opening.
- `<key id>`: 8 hex characters, SHA-256 of the key (public, not secret). It says which key sealed
  the value, which is what makes rotation possible.
- The purpose and the key id are bound in as associated data: a value copied into another column,
  or relabelled with another key id, does not open.
- The encryption key and the lookup key are separate HKDF-SHA256 subkeys of the configured key.

## Keys

| Setting | Where | Rules (`src/lib/startup-check.ts`, `fieldEncryptionProblems`) |
|---|---|---|
| `FIELD_ENCRYPTION_KEY` | Vercel environment variables (Production and Preview/staging get **different** keys); never in git | Required on staging and production (the server refuses to start without it). 32 random bytes as standard base64 (`openssl rand -base64 32`). Not a placeholder. A key of its own: never the same as `APP_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `HASH_SALT`, `CRON_SECRET`, `BACKUP_ENCRYPTION_KEY` or any other secret setting. A key made by the codespace (marked "development") is refused on staging and production. |
| `FIELD_ENCRYPTION_KEY_PREVIOUS` | only during a rotation | One or more old keys (comma-separated). They only **open** values; new values are always sealed with `FIELD_ENCRYPTION_KEY`. Must differ from the current key and from every other secret. |

Development: the codespace makes its own throwaway key in `.env` (`.devcontainer/env-sync.sh`,
never committed, never printed). A laptop without one uses a key derived from
`BETTER_AUTH_SECRET` (fake data only; a warning at start). The real site never does.

**Losing the key loses the data**: there is no way to open the values without it. Keep every key
you ever used in the password manager for as long as a backup made with it exists (backups hold
the ciphertext, not the plain values).

## Who may decrypt

Only through `src/lib/field-crypto.ts`, only on the server, only where the founder allowed it (Q12):

| Where (`where` in the security event) | What | Why |
|---|---|---|
| `post_form` (`src/lib/wizard/server.ts`) | address + pin | the owner's own post form |
| `trip`, `trip_extras` (`src/lib/booking/queries.ts`, `src/lib/trip/server.ts`) | address + pin | the guest's trip page, only inside the address window (until a week after check-out) |
| `booking_notify` (`src/lib/booking/notify.ts`) | address, guest phone | the booking emails (the address only in the confirmation body; the host's email has the guest's phone) |
| `host_booking` (`src/lib/booking/queries.ts`) | guest phone | the host's booking page |
| `admin_booking` (`src/lib/admin/server/bookings.ts`) | guest phone | ADMIN only; other staff see the last 2 digits |
| `admin_review`, `admin_verification` (`src/lib/admin/server/moderation.ts`, `verifications.ts`) | address (+ pin on review) | staff checking a listing or an ownership request |
| `account_export` (`src/lib/account/export.ts`) | address + pin of own listings, own phone on own trips | the data export to the person themselves |
| `derived_fields`, `publish_check`, `mistake_check`, `publish_gate`, `nearby`, `nearby_recompute`, `walk_backfill`, `visit_badge`, `phone_cleanup` | pin / address / phone | server-side computations at save time (public map point, walking times, nearby places, publish checks, the visit badge fingerprint, the phone-format clean-up). Nothing is shown. |

Everything public (cards, search, maps, the listing page, OG images, JSON-LD) uses the public
point and never opens a pin. Decrypted values come back in objects tainted by reference (React
taint, `src/lib/security/taint.ts`): only a DTO built from their fields may reach a page. The
guest phone is a short string that legitimately reaches its host's page, so it is not tainted by
value; the rows it is read with are.

Writes: `sealAddress`, `sealPin`, `sealGuestPhone` throw when there is no usable key. A value is
never stored in plain text instead.

## When a value cannot be opened

Wrong or missing key, or a changed ciphertext: the read **fails closed**. The whole location reads
as missing (never the half that opened), the page shows its "not available" state (trip page:
"We can't show the exact address right now…"; post form: "We can't show the address and pin you
saved right now…"; admin review: "can't be read right now"), publishing is blocked (the location
counts as missing), save-time computations change nothing, and a `field_decrypt_failed` security
event is written (field, reason, place; at most once a minute per combination; never a value).
No page crashes.

## Moving old rows: `npm run db:encrypt-fields`

```
npm run db:encrypt-fields -- --dry-run     count only, change nothing
npm run db:encrypt-fields                  encrypt / re-seal, empty the plain columns, add the guard
npm run db:encrypt-fields -- --verify      also open EVERY stored value and count those that do not open
npm run db:encrypt-fields -- --batch 500   rows per batch (default 200)
```

- Idempotent and batched: rows are read in id order, a batch at a time; a row is written only when
  something is left to do, and only while it still holds what was read (a host saving a new
  address meanwhile is never overwritten; the next run picks it up). A second run changes nothing.
- An encrypted value already there wins over a plain copy. Half a pin is dropped.
- A stored value it cannot open is **left as it is** and counted as `unreadable`; the script exits
  with code 1 so a deploy notices.
- It prints counts and the key id only, never a value.
- It runs by itself in the codespace (`.devcontainer/setup.sh`, `start.sh`) and on a Vercel build
  that pushes the schema (`scripts/vercel-build.mjs`). Before it, the schema must be pushed:
  `npx prisma db execute --file prisma/sql/before-push.sql && npx prisma db push`.

## Key rotation (planned, or after a suspected leak of the key)

1. Generate the new key: `openssl rand -base64 32`. Store it in the password manager next to the
   old one, with the date.
2. In Vercel (Production; Preview has its own key): set `FIELD_ENCRYPTION_KEY_PREVIOUS` to the
   **old** key and `FIELD_ENCRYPTION_KEY` to the **new** one. Redeploy. From now on new values are
   sealed with the new key and old values still open with the previous one.
3. Re-seal every row with the new key, from a machine with the production settings
   (`vercel env pull`, then): `npm run db:encrypt-fields`. It prints how many values were re-sealed
   and how many are "left under an old key" (must be 0).
4. Check: `npm run db:encrypt-fields -- --verify` (with the new key only:
   `FIELD_ENCRYPTION_KEY_PREVIOUS=` unset in that shell). It must report `0 unreadable` and
   `0 … under an old key`.
5. Remove `FIELD_ENCRYPTION_KEY_PREVIOUS` in Vercel and redeploy.
6. Keep the old key in the password manager until the last backup made before step 3 has expired
   (backups older than that still hold values sealed with it). After a **leak**, also replace the
   backups made before step 3 once the new ones exist, and follow INCIDENT_PLAN.md.

The lookup values (`guestPhoneLookup`) are re-made with the new key in step 3; during steps 2–3
the per-phone booking cap matches lookups under both keys.

## Backups and restore

Backups (`scripts/db-backup.ts`, the off-site copy) contain the ciphertext, so a restore needs the
key that sealed those values. Restore into a database created with `prisma db push`, then run
`npm run db:encrypt-fields -- --verify`: it adds the CHECK constraints again (a fresh push has
none), seals any plain values from a backup made before encryption, and reports values that do not
open with the current keys (set the old key as `FIELD_ENCRYPTION_KEY_PREVIOUS` and run again).

## Later: dropping the plain columns

Once every environment (production, staging, every codespace that matters) has run
`db:encrypt-fields` with the guard on, a release can drop `legacyAddress`, `legacyLat`,
`legacyLng` and `legacyGuestPhone` from `prisma/schema.prisma` (and the two constraints with
them). Until then they stay so an older database keeps its data until it is migrated.
