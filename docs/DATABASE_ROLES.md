# Database roles (least privilege)

SECURITY_REPORT 12.3.b. The real site's database has **two login roles**, so that a bug or a
stolen site password can read and change rows but never change, empty or drop a table.

| Role | Used by | May do | Where its address lives |
|---|---|---|---|
| `bayit_app` | the running site (every page, action and scheduled job) | read, add, change and delete **rows** of the existing tables; use their counters (sequences) | `DATABASE_URL` at the hosting |
| `bayit_migrate` | you or the developer, by hand, when the tables change | everything on the tables: create, change, drop (it owns them) | `MIGRATION_DATABASE_URL`, given for one command, **never** saved at the hosting or in a `.env` file |

The owner role the database host made for you (Neon: `neondb_owner`) is used once, to create the
two roles, and then only to repair them.

What the site never does at runtime (and a test proves it, `tests/unit/no-runtime-ddl.test.ts`):
`CREATE`/`ALTER`/`DROP` of a table, index, trigger, function or type, `TRUNCATE`, `GRANT`/`REVOKE`.
The two places that need such rights are scripts you run by hand: a restore
(`npm run db:restore`, `npm run db:restore-test`) and the field-encryption step
(`npm run db:encrypt-fields`, it adds a table rule). The start-up check refuses a real site whose
`DATABASE_URL` connects as an owner role (`postgres`, `neondb_owner`, `bayit_migrate`, `root`,
`admin`), and a staging or production site whose `MIGRATION_DATABASE_URL` uses the same role as
`DATABASE_URL` or no TLS (`src/lib/ops-startup.ts`).

## Set it up on Neon (once, about 15 minutes)

1. **Create the project** in Neon: region **Europe (Frankfurt)**, Postgres 16 or newer. Neon makes
   the database `neondb` and the owner role `neondb_owner`.
2. **Copy the owner's connection string**: Neon → your project → **Connect** → role
   `neondb_owner`, "Connection pooling" **off** (the direct address, without `-pooler` in the host
   name). Keep it in your password manager, not in a file.
3. **Create the two roles and their rights** from a terminal on your own computer (or the
   codespace's terminal, typing the address only into this one command) with `psql`:

   ```sh
   psql "<the owner's direct connection string>" \
     -v app_password="$(openssl rand -base64 24 | tr -d '/+=')" \
     -v migrate_password="$(openssl rand -base64 24 | tr -d '/+=')" \
     -f scripts/sql/roles.sql
   ```

   It prints a small table with `bayit_app` and `bayit_migrate`, every column `f` except
   `rolcanlogin`. It stops with an error, changing nothing more, if either role has a right it must
   not have. Neon alternative: create the two roles under **Branch → Roles** first (Neon shows each
   password once), then run the same command **without** the two `-v …_password` lines.
4. **Set the passwords you need**: run `\password bayit_app` and `\password bayit_migrate` in `psql`
   as the owner if you did not keep the generated ones (they are not printed). Save both in your
   password manager.
5. **Build the two addresses** (Neon → Connect, choose the role, copy):
   - `DATABASE_URL` = role `bayit_app`, connection pooling **on** (host with `-pooler`), ending in
     `?sslmode=require`. Put it in the hosting's settings (Vercel → Settings → Environment
     Variables, Production only).
   - `MIGRATION_DATABASE_URL` = role `bayit_migrate`, pooling **off**, `?sslmode=require`. Keep it in
     your password manager only.
6. **Create the tables** (README "Going live", step 4), as `bayit_migrate`:

   ```sh
   MIGRATION_DATABASE_URL="<bayit_migrate address>" npx prisma db execute --file prisma/sql/before-push.sql
   MIGRATION_DATABASE_URL="<bayit_migrate address>" npx prisma db push
   DATABASE_URL="<bayit_migrate address>" SITE_ENV=production npm run db:encrypt-fields
   SITE_ENV=production DATABASE_URL="<bayit_migrate address>" npm run db:seed
   ```

   `prisma.config.ts` uses `MIGRATION_DATABASE_URL` for every `prisma` command when it is set.
   `db:encrypt-fields` and `db:seed` read `DATABASE_URL`, so they are given the migration address
   for that one command (the seed resets a counter, which the app role may not do; the Vercel
   build does the same for `db:encrypt-fields` when `MIGRATION_DATABASE_URL` is set,
   `scripts/vercel-build.mjs`).
7. **Run `scripts/sql/roles.sql` again** (step 3, as the owner, without the password lines) after
   any table change made as the owner by mistake, or after restoring into a new database: it hands
   every table to `bayit_migrate` again and gives `bayit_app` its row rights on new tables. It is
   safe to repeat.

## Later table changes (a new release with a schema change)

Run them yourself, before or right after the deploy that needs them, as `bayit_migrate`:

```sh
MIGRATION_DATABASE_URL="<bayit_migrate address>" npx prisma db execute --file prisma/sql/before-push.sql
MIGRATION_DATABASE_URL="<bayit_migrate address>" npx prisma db push
```

New tables made by `bayit_migrate` get the app's row rights automatically (the "default
privileges" in `roles.sql`).

## Checked on 9 November 2026

`scripts/sql/roles.sql` was run on a throwaway Postgres 16 database by an owner role made like
Neon's (`CREATEROLE`, `CREATEDB`, not a superuser), after `prisma db push` of the full schema:

- `bayit_app` could read, add and delete rows, and use a table `bayit_migrate` made later;
- `bayit_app` was refused `CREATE TABLE`, `CREATE TEMP TABLE`, `ALTER TABLE`, `DROP TABLE`,
  `TRUNCATE`, `CREATE SCHEMA` and `CREATE INDEX`;
- `bayit_migrate` could change and create tables, and `prisma db push` through
  `MIGRATION_DATABASE_URL` answered "already in sync".

The throwaway database and the three test roles were dropped afterwards.

## On this machine (codespace, laptop)

Nothing to do: `MIGRATION_DATABASE_URL` stays empty and the local `bayit` role does both jobs. Never
put a real database's address into `.env` here.
