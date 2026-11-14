# Backups and restore tests

SECURITY_REPORT 12.4.a–d. Three kinds of copy, each for a different accident:

| Copy | Where | How often | Protects against | Kept |
|---|---|---|---|---|
| The database host's own backups and point-in-time restore | Neon (the same company as the database) | continuous | a bad change or a deleted row: go back to any minute in the restore window | your Neon plan's restore window (write it in `INCIDENT_PLAN.md`, "Facts to fill in") |
| **The weekly encrypted off-site copy** | Backblaze B2, EU Central, its **own** account, a bucket with Object Lock | every Sunday night (`/api/cron/offsite-backup`, `vercel.json`) | losing the Neon account, a stolen hosting or database password, ransomware: nobody can delete or change a copy for 60 days, not even with the job's key | 60 days locked (`OFFSITE_RETENTION_DAYS`), then the bucket's lifecycle rule removes it |
| A manual backup | Admin → Maintenance → "Full backup", `npm run db:backup` | before a risky change | a quick undo on your own machine (not on Vercel: it has no lasting disk) | until you delete the folder |

Photos are not in these copies (SECURITY_REPORT 12.4.c, yours: R2 object versioning).

## What a copy is

The usual backup folder (`src/lib/admin/maintenance/backup-format.ts`): `metadata.json` (tables,
row counts, the commit), `schema.prisma`, one `tables/<Table>.jsonl` per table, and
`database.dump` where `pg_dump` exists. For the off-site copy the folder is packed into one stream
(`backup-archive.ts`, only these file names are allowed) and encrypted on the fly
(`backup-crypto.ts`, `node:crypto`, no library):

- **AES-256-GCM in 64 KiB chunks**, each chunk with its own tag: a changed, reordered, missing or
  added chunk, a file cut short or a changed header all fail to decrypt, and nothing of a chunk is
  used before its tag checks out;
- a fresh **file key per copy** (HKDF-SHA256 of `BACKUP_ENCRYPTION_KEY` and a random salt);
- a **header** with the format name `BAYITENC`, the version (1) and the **key id** (16 hex
  characters, not secret: which key made the file), so a restore with the wrong key says so at once.

The job (`offsite.ts`) then uploads it with the same S3 client library as the photo storage but
**its own settings** (`OFFSITE_S3_*`), asks for **Object Lock, COMPLIANCE mode, until now + 60
days** on the upload itself, and checks the result: the stored size and lock are read back, the
copy is **downloaded again**, its SHA-256 compared and every chunk decrypted. It never deletes
anything, so its key has no delete right. The result goes to the audit log
(`maintenance.offsite_backup`) and the security event log (`offsite_backup_ok` /
`offsite_backup_failed`); a failure, or no good copy for 8 days, alerts you by email and Telegram
within the hour (`src/lib/security/alerts-rules.ts`).

Size: the job runs on Vercel with 300 seconds and a 512 MB temporary disk. Both are plenty for
years of this site's database (the demo database is under 1 MB). If a run ever fails with a time
or disk error, the same job runs from any computer with `npm run backup:offsite`.

## Set up the off-site copy (once, about 30 minutes)

You already created the account (OWNER_TODO "Second backup on Backblaze B2"). Then:

1. **The bucket**: Backblaze → Buckets → Create a Bucket → name e.g. `bayit-backup`, **Private**,
   **Object Lock: Enable**. Default retention can stay off (the job locks every copy itself) or be
   set to Compliance, 60 days. Note the bucket's **Endpoint** (e.g.
   `s3.eu-central-003.backblazeb2.com`).
2. **The lifecycle rule** (Bucket Settings → Lifecycle Settings → custom): prefix
   `bayit/production/`, hide after **90** days, delete **1** day after hiding. A locked copy cannot
   go before its lock ends, so this only tidies copies older than the lock.
3. **The job's key, without delete rights.** The web page's "Read and Write" key includes
   `deleteFiles`, so make it with the Backblaze command-line tool instead (ask the developer to run
   it with you; it needs the account's master key once, which you then keep offline):

   ```sh
   b2 account authorize            # asks for the master keyID and key
   b2 key create --bucket bayit-backup bayit-backup-job \
     listBuckets,listFiles,readFiles,writeFiles,readFileRetentions,writeFileRetentions
   ```

   It prints a **keyID** and an **applicationKey** once. No `deleteFiles`, no `bypassGovernance`,
   no other bucket. (Even a key with delete rights cannot remove a copy whose COMPLIANCE lock is
   still running; the smaller key also keeps old copies' names and lifecycle safe.)
4. **The encryption key**: on your own computer, `openssl rand -base64 32`. Save it in your
   password manager as "Bayit backup key, made <date>" **and** print it and keep the paper in a
   safe place. Without it no copy can ever be read; with it, anyone who has a copy can. It is not
   any other key of the site (the start-up check refuses a reused one or a codespace key).
5. **The hosting settings** (Vercel → Settings → Environment Variables, Production):

   | Name | Value |
   |---|---|
   | `BACKUP_ENCRYPTION_KEY` | the key of step 4 |
   | `OFFSITE_S3_ENDPOINT` | `https://` + the bucket's endpoint, e.g. `https://s3.eu-central-003.backblazeb2.com` |
   | `OFFSITE_S3_REGION` | the part after `s3.`, e.g. `eu-central-003` |
   | `OFFSITE_S3_BUCKET` | `bayit-backup` |
   | `OFFSITE_S3_ACCESS_KEY_ID` | the keyID of step 3 |
   | `OFFSITE_S3_SECRET_ACCESS_KEY` | the applicationKey of step 3 |
   | `OFFSITE_RETENTION_DAYS` | leave empty (60), or 14–365 |

   The real site does not start while one of the first six is missing or wrong, or when the
   endpoint or the key id is the photo storage's (`src/lib/admin/maintenance/offsite-config.ts`).
6. **Run it once now** instead of waiting for Sunday: open a terminal and run (with your real
   domain and `CRON_SECRET`):

   ```sh
   curl -sS -H "Authorization: Bearer <CRON_SECRET>" https://<your domain>/api/cron/offsite-backup
   ```

   It answers `"ok":true` with the copy's name, size and lock date. In Backblaze → Browse Files you
   see `bayit/production/<date>.bkenc` with a lock icon. Then do the restore test below once.

## Restore from the off-site copy

On a computer you trust (never a codespace for real data: `db-restore` refuses to put a real-site
backup into a local or codespace database):

```sh
# 1. which copies exist (the job's settings in the environment, typed for these commands only)
npm run backup:offsite -- list
# 2. download one (still encrypted)
npm run backup:offsite -- download <name> --out copy.bkenc
# 3. into a NEW EMPTY database (a Neon branch or a new database; never the live one)
BACKUP_ENCRYPTION_KEY="<from your password manager>" \
RESTORE_TARGET_URL="<the empty database, owner or bayit_migrate role>" \
  npm run db:restore -- copy.bkenc --create-schema
```

`db:restore` refuses a database that already has rows, so it can never overwrite live data. Then
run `scripts/sql/roles.sql` on the new database (docs/DATABASE_ROLES.md, step 7), check it, and
only then point `DATABASE_URL` at it. With Neon's own point-in-time restore you usually do not
need this: Neon → Branches → Restore (or "Create branch from a point in time").

## Restore test (before launch, then once a month)

The test that matters is the one on the real stack. It takes about 20 minutes.

1. **Make a scratch database.** Neon → your project → Branches → **New branch** from `main`,
   named `restore-test-<year>-<month>`. In that branch: Databases → **New database**
   `restore_test` (empty). Copy its connection string (role `neondb_owner`, pooling off).
2. **Restore the newest off-site copy into it and check every table**, on a trusted computer, with
   the job's settings and the backup key typed for this one command:

   ```sh
   BACKUP_ENCRYPTION_KEY="…" OFFSITE_S3_ENDPOINT="…" OFFSITE_S3_REGION="…" OFFSITE_S3_BUCKET="…" \
   OFFSITE_S3_ACCESS_KEY_ID="…" OFFSITE_S3_SECRET_ACCESS_KEY="…" SITE_ENV=production \
   RESTORE_TARGET_URL="<the restore_test database>" \
     npm run db:restore-test -- --latest-offsite
   ```

   It downloads the newest copy, decrypts it (the key must match: it says which key id it
   needs), creates the tables from the copy's own schema, loads every row and **counts every
   table against the copy's list**. It ends with `RESTORE TEST PASSED: <tables> tables, <rows>
   rows, every count matches (<minutes> min in all)` or `RESTORE TEST FAILED` with the tables
   that differ (exit code 1).
3. **Also try Neon's point-in-time restore once** (before launch): Branches → Restore → pick a time
   an hour ago → new branch; in its SQL editor run
   `SELECT count(*) FROM "User"; SELECT count(*) FROM "Listing"; SELECT count(*) FROM "Booking";`
   and compare with the live numbers.
4. **Write the note** (in your private incident notes, never in the repository): the date, which
   copy, tables, rows, minutes, PASSED or FAILED, anything that surprised you.
5. **Delete the test branch** in Neon (it holds a full copy of real data).

Practice locally first (any time, no real data): `npm run db:restore-test` makes a fresh backup
of this machine's database, restores it into a scratch database `bayit_restore_test_<time>`,
checks every count and drops the scratch database. With `-- <folder>` or `-- <file>.bkenc` it
tests that backup instead. On 9 November 2026 both passed here: a fresh backup (48 tables, 1164
rows) and the same kind of backup encrypted with a throwaway key; the same file with a wrong key
was refused ("made with another key"), and a copy cut short was refused ("cut short or damaged").

## Tests

`src/lib/admin/maintenance/offsite.test.ts` (fake S3 server): the upload request (bucket, name,
`x-amz-object-lock-mode: COMPLIANCE`, the retain-until date, Content-MD5, no delete request ever),
the download check, encryption round trips of many sizes, the wrong key, a cut-short file,
changed and reordered chunks, a changed header, and that the settings refuse the photo storage's
key or endpoint. `backup-format.test.ts` covers the folder format.
