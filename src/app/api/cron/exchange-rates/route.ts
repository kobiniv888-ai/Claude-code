import { getRatesInfo, refreshExchangeRates } from "@/lib/currency";
import { refreshUsdPrices } from "@/lib/listing/lifecycle";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/exchange-rates — daily (vercel.json).
 * Fetches today's exchange rates, then refreshes the USD prices every listing is filtered and
 * sorted by (owners set prices in GEL, ILS, EUR…).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("exchange-rates", async () => {
    const rates = await refreshExchangeRates();
    const { fetchedAt } = await getRatesInfo();
    const updated = await refreshUsdPrices(rates);
    return { fetchedAt: fetchedAt?.toISOString() ?? null, fresh: fetchedAt !== null && Date.now() - fetchedAt.getTime() < 3600_000, updated };
  });
}
