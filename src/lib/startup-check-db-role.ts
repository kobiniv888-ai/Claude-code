/**
 * The database role the running site connects as (SECURITY_REPORT 12.3.b, FE-4), checked ONCE at
 * start by src/instrumentation-node.ts. The startup check (src/lib/ops-startup.ts) already refuses
 * the known owner role NAMES in DATABASE_URL; this asks the database itself what `current_user`
 * may do, so an owner role with another name, or a role made a member of another role (Neon makes
 * every role created in its Console, CLI or API a member of neon_superuser: CREATEDB, CREATEROLE,
 * BYPASSRLS, read and write on all data), is caught too.
 *
 * Production: any of these refuses the start (exit code 1). Staging: a loud warning (a staging
 * database may still run as its owner; docs/DATABASE_ROLES.md). A database that cannot be asked is
 * a warning only: the site cannot serve data from it anyway, and the next start asks again.
 *
 * Pure decision (`databaseRoleProblems`) plus the one query (`readDatabaseRoleFacts`). Names only.
 */

export type DatabaseRoleFacts = {
  role: string;
  superuser: boolean;
  createRole: boolean;
  createDb: boolean;
  bypassRls: boolean;
  replication: boolean;
  /** May create objects in the schema public. */
  schemaCreate: boolean;
  /** Owns at least one table of the schema public. */
  ownsTables: boolean;
  /** The roles it is a member of (pg_auth_members). */
  memberOf: string[];
};

export function databaseRoleProblems(facts: DatabaseRoleFacts): string[] {
  const rights = [
    facts.superuser && "superuser",
    facts.createRole && "create roles",
    facts.createDb && "create databases",
    facts.bypassRls && "bypass row security",
    facts.replication && "replication",
    facts.schemaCreate && "create objects in the schema public",
    facts.ownsTables && "owns tables (can change them)",
  ].filter((x): x is string => Boolean(x));
  const problems: string[] = [];
  if (rights.length) {
    problems.push(
      `DATABASE_URL connects as "${facts.role}", which can ${rights.join(", ")}: the site runs as the least-privilege role bayit_app (scripts/sql/roles.sql, docs/DATABASE_ROLES.md).`,
    );
  }
  if (facts.memberOf.length) {
    problems.push(
      `DATABASE_URL's role "${facts.role}" is a member of ${facts.memberOf.map((r) => `"${r}"`).join(", ")} and can act with its rights (Neon makes Console-created roles members of neon_superuser): run scripts/sql/roles.sql again, or drop the role and let that file create it.`,
    );
  }
  return problems;
}

type RawClient = { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> };

export async function readDatabaseRoleFacts(client: RawClient): Promise<DatabaseRoleFacts> {
  const [row] = await client.$queryRawUnsafe<
    { role: string; superuser: boolean; create_role: boolean; create_db: boolean; bypass_rls: boolean; replication: boolean; schema_create: boolean; owns_tables: boolean; member_of: string[] | null }[]
  >(
    `SELECT r.rolname AS role, r.rolsuper AS superuser, r.rolcreaterole AS create_role, r.rolcreatedb AS create_db,
            r.rolbypassrls AS bypass_rls, r.rolreplication AS replication,
            has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
            EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owns_tables,
            ARRAY(SELECT g.rolname::text FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = r.oid ORDER BY 1) AS member_of
     FROM pg_roles r WHERE r.rolname = current_user`,
  );
  if (!row) throw new Error("current_user not found in pg_roles");
  return {
    role: row.role,
    superuser: row.superuser,
    createRole: row.create_role,
    createDb: row.create_db,
    bypassRls: row.bypass_rls,
    replication: row.replication,
    schemaCreate: row.schema_create,
    ownsTables: row.owns_tables,
    memberOf: row.member_of ?? [],
  };
}
