import { getHostPledgePrompt } from "@/lib/pledge/server";
import { ReacceptBanner } from "./reaccept-banner";

/** /account: asks hosts to accept the (new) Bayit pledge. Renders nothing when there is nothing to ask. */
export async function AccountPledgeBanner({ userId, className }: { userId: string; className?: string }) {
  const status = await getHostPledgePrompt(userId);
  if (!status) return null;
  return <ReacceptBanner status={status} className={className} />;
}
