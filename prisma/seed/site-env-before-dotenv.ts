/**
 * SITE_ENV as the COMMAND LINE / real environment gave it, read before `dotenv/config` fills in
 * the values from .env (prisma/seed/index.ts imports this file first). A codespace's .env says
 * SITE_ENV="development", so `DATABASE_URL=<prod url> npm run db:seed` from there would otherwise
 * look like a development seed and put demo users, staff and listings into production
 * (seed-demo-into-prod). Import before "dotenv/config".
 */
export const SITE_ENV_BEFORE_DOTENV: string | undefined = process.env.SITE_ENV;
export const SEED_DEMO_BEFORE_DOTENV: string | undefined = process.env.SEED_DEMO;
