import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { emailHash } from '@pretoscop/notify';
import { createDb, createPool } from '../client';
import {
  affiliateAllow,
  affiliateRestore,
  affiliateSyncForbidden,
  alertsFixtureEvidence,
  alertsFixtureExtraProducts,
  alertsFixturePrice,
  alertsFixtureState,
  alertsFixtureSuppress,
  createAlertsFixture,
  createE2eFixture,
  createLlmFixture,
  dropAlertsFixture,
  dropE2eFixture,
  e2eFixtureClicks,
} from '../fixtures/e2e';

// Usage: tsx src/cli/e2e-fixture.ts <command> [args] — prints JSON on stdout.
//   create | drop | clicks                     product-page fixture (M13)
//   affiliate-allow                            M24: a temporary approved 2Performant program for forit
//                                              that allows comparators, flag on (prints flagWas)
//   affiliate-sync-forbidden                   M24: the real program sync with forit's permission "no"
//   affiliate-restore <flagWas:true|false>     M24: removes that program and puts the flag back
//   alerts-create                              alert fixture (M19): product, offers, flag on
//   alerts-price <offerKey> <lei>              synthetic price change of a fixture offer
//   alerts-state <email>                       account, alerts and sends of a test address
//   alerts-evidence <email…>                   consent records and suppressions (by address hash)
//   alerts-products <n>                        n extra throwaway products (removed by alerts-drop)
//   alerts-suppress <email> <reason>           puts a test address on the suppression list
//   alerts-drop <flagWas:on|off> <email…>      removes the alert fixture and the test addresses
//   llm-decision <productId>                   M22: a review item accepted by the LLM, its opinion and a ledger row (removed by drop)
loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const hashes = (emails: string[]) => emails.map((e) => emailHash(env.ALERTS_SECRET, e));
try {
  const db = createDb(pool);
  const [cmd = 'create', ...args] = process.argv.slice(2);
  let out: unknown;
  if (cmd === 'drop') out = { dropped: await dropE2eFixture(db) };
  else if (cmd === 'clicks') out = await e2eFixtureClicks(db);
  else if (cmd === 'affiliate-allow') out = await affiliateAllow(db);
  else if (cmd === 'affiliate-sync-forbidden') out = { changes: await affiliateSyncForbidden(db) };
  else if (cmd === 'affiliate-restore')
    out = { restored: await affiliateRestore(db, args[0] === 'true') };
  else if (cmd === 'alerts-create') out = await createAlertsFixture(db);
  else if (cmd === 'alerts-price')
    out = await alertsFixturePrice(db, args[0] ?? 'a', Number(args[1]));
  else if (cmd === 'alerts-state') out = await alertsFixtureState(db, args[0] ?? '');
  else if (cmd === 'alerts-evidence') out = await alertsFixtureEvidence(db, hashes(args));
  else if (cmd === 'alerts-products') out = await alertsFixtureExtraProducts(db, Number(args[0] ?? 1));
  else if (cmd === 'alerts-suppress') {
    const reason = args[1] === 'bounce' || args[1] === 'unsubscribed' ? args[1] : 'complaint';
    out = await alertsFixtureSuppress(db, hashes([args[0] ?? ''])[0]!, reason);
  }
  else if (cmd === 'alerts-drop')
    out = {
      dropped: await dropAlertsFixture(db, {
        emailHashes: hashes(args.slice(1)),
        restoreFlag: args[0] === 'on',
      }),
    };
  else if (cmd === 'llm-decision') out = await createLlmFixture(db, Number(args[0]));
  else out = await createE2eFixture(db);
  console.log(JSON.stringify(out));
} finally {
  await pool.end();
}
