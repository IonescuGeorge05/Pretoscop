import { botPolicyUpdated, botUserAgents, splitEgressIps } from '@/lib/bot-policy';
import { serverEnv } from '@/lib/db';

// Read at request time: publishing new IPs needs only an environment change and a restart.
export const dynamic = 'force-dynamic';

/**
 * GET /bot/ips.json — machine-readable identity of PretoscopBot: User-Agent strings and the fixed
 * egress addresses (env `BOT_EGRESS_IPS`; empty lists until they are published at launch).
 */
export function GET(): Response {
  const env = serverEnv();
  const ua = botUserAgents(env.BOT_INFO_URL);
  const { ipv4, ipv6 } = splitEgressIps(env.BOT_EGRESS_IPS);
  return Response.json(
    {
      updated: botPolicyUpdated(),
      user_agent: ua.page,
      feed_user_agent: ua.feed,
      ipv4,
      ipv6,
    },
    { headers: { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } },
  );
}
