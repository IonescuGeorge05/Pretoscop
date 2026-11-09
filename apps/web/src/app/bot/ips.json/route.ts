import { botPolicyUpdated, botUserAgents, ipPrefixes, splitEgressIps } from '@/lib/bot-policy';
import { serverEnv } from '@/lib/db';

// Read at request time: publishing new IPs needs only an environment change and a restart.
export const dynamic = 'force-dynamic';

/**
 * GET /bot/ips.json — machine-readable identity of PretoscopBot: User-Agent strings and the fixed
 * egress addresses (env `BOT_EGRESS_IPS`; empty lists until they are published at launch).
 * `creationTime` + `prefixes` follow googlebot.json (M21), the format WAF tools and the bot
 * verification programmes read; `updated`, `ipv4` and `ipv6` stay for readers of the first version.
 */
export function GET(): Response {
  const env = serverEnv();
  const ua = botUserAgents(env.BOT_INFO_URL);
  const { ipv4, ipv6 } = splitEgressIps(env.BOT_EGRESS_IPS);
  const updated = botPolicyUpdated();
  return Response.json(
    {
      creationTime: `${updated}T00:00:00.000000Z`,
      prefixes: ipPrefixes(env.BOT_EGRESS_IPS),
      updated,
      user_agent: ua.page,
      feed_user_agent: ua.feed,
      ipv4,
      ipv6,
    },
    { headers: { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } },
  );
}
