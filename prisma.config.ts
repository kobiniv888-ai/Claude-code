import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * The Prisma command line (db push, migrate, db execute, studio). The running site never reads
 * this file: its client connects with DATABASE_URL (src/lib/db.ts), the least-privilege role
 * bayit_app on the real site. Changing the tables uses MIGRATION_DATABASE_URL (the role
 * bayit_migrate, scripts/sql/roles.sql, docs/DATABASE_ROLES.md) when it is set; on a codespace or a
 * laptop it is empty and DATABASE_URL does both (SECURITY_REPORT 12.3.b).
 */
const migrationUrl = process.env["MIGRATION_DATABASE_URL"]?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --require ./scripts/server-script.cjs prisma/seed/index.ts",
  },
  datasource: {
    url: migrationUrl || process.env["DATABASE_URL"],
  },
});
