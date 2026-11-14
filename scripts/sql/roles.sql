-- Database roles for the real site (SECURITY_REPORT 12.3.b; steps in docs/DATABASE_ROLES.md).
--
--   bayit_migrate  owns the tables: changes them (prisma db push / migrate, prisma db execute,
--                  npm run db:encrypt-fields, a restore). Used ONLY from your computer or a
--                  one-off job, through MIGRATION_DATABASE_URL. Never set on the running site.
--   bayit_app      what the running site uses (DATABASE_URL): reads and writes rows, never changes
--                  a table, never a superuser, cannot make roles or databases.
--
-- Run it once as the database's owner (Neon: the role "neondb_owner"), and again after you add
-- a table by hand (it is safe to repeat). Passwords are given on the command line, never written
-- into this file:
--
--   psql "<the owner's connection string>" \
--     -v app_password="$(openssl rand -base64 24)" \
--     -v migrate_password="$(openssl rand -base64 24)" \
--     -f scripts/sql/roles.sql
--
-- Leave out -v app_password / -v migrate_password on a later run to keep the passwords as they are.
-- Neon: you can also create the two roles in the console (Branch → Roles) first; this file then
-- only sets their rights.

\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bayit_migrate') THEN
    CREATE ROLE bayit_migrate LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bayit_app') THEN
    CREATE ROLE bayit_app LOGIN;
  END IF;
END
$roles$;

-- New roles start without superuser, create-role, create-database, replication or RLS-bypass
-- rights; the check at the end refuses to finish if either role has one of them.
ALTER ROLE bayit_migrate WITH LOGIN;
ALTER ROLE bayit_app WITH LOGIN CONNECTION LIMIT 60;
\if :{?migrate_password}
ALTER ROLE bayit_migrate WITH PASSWORD :'migrate_password';
\endif
\if :{?app_password}
ALTER ROLE bayit_app WITH PASSWORD :'app_password';
\endif

-- The owner may act as bayit_migrate (needed to hand the tables over below; PostgreSQL 16+).
GRANT bayit_migrate TO CURRENT_USER;

-- Who may create things in the schema: only the migration role.
SELECT current_database() AS dbname \gset
-- The app may connect, nothing more: no temporary tables either (PostgreSQL gives every role
-- TEMPORARY by default, through PUBLIC).
REVOKE TEMPORARY ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO bayit_app;
GRANT CONNECT, TEMPORARY ON DATABASE :"dbname" TO bayit_migrate;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO bayit_migrate;
GRANT USAGE ON SCHEMA public TO bayit_app;

-- Hand every existing table, sequence, type and function of the schema to bayit_migrate, so that
-- later changes (made as bayit_migrate) can alter them.
DO $owners$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner <> 'bayit_migrate' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO bayit_migrate', item.tablename);
  END LOOP;
  FOR item IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner <> 'bayit_migrate' LOOP
    -- A sequence that belongs to a table column moved with its table above.
    BEGIN
      EXECUTE format('ALTER SEQUENCE public.%I OWNER TO bayit_migrate', item.sequencename);
    EXCEPTION WHEN feature_not_supported OR object_not_in_prerequisite_state THEN NULL;
    END;
  END LOOP;
  FOR item IN
    SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e' AND pg_get_userbyid(t.typowner) <> 'bayit_migrate'
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO bayit_migrate', item.typname);
  END LOOP;
  FOR item IN
    SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> 'bayit_migrate'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO bayit_migrate', item.fn);
  END LOOP;
END
$owners$;

-- The app: rows only. No TRUNCATE, REFERENCES or TRIGGER, no DDL of any kind.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bayit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bayit_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bayit_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bayit_app;

-- Tables made later by bayit_migrate get the same rights automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE bayit_migrate IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bayit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bayit_migrate IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bayit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bayit_migrate IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO bayit_app;

-- Refuse to finish when either role can do more than it should.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('bayit_app', 'bayit_migrate') AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'bayit_app or bayit_migrate has a superuser, create-role, create-database, replication or RLS-bypass right: remove it (ALTER ROLE ... NOSUPERUSER ...) as a superuser, or create the roles again';
  END IF;
  IF has_schema_privilege('bayit_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'bayit_app may still create objects in the schema public';
  END IF;
  IF has_database_privilege('bayit_app', current_database(), 'CREATE') OR has_database_privilege('bayit_app', current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION 'bayit_app may still create schemas or temporary tables in this database';
  END IF;
END
$check$;

-- What the two roles can do now (no secrets printed).
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname IN ('bayit_app', 'bayit_migrate') ORDER BY rolname;
