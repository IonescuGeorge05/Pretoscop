/**
 * Runs the local Open Icecat stand-in until interrupted and prints its API URL:
 *   pnpm --filter @pretoscop/icecat mock
 * Then e.g. `ICECAT_BASE_URL=<url> ICECAT_USERNAME=demo pnpm --filter @pretoscop/worker icecat:lookup 5397184119709`.
 */
import { startIcecatMock } from '../mock';

const mock = await startIcecatMock();
console.log(`Open Icecat mock (synthetic fixtures) at ${mock.apiUrl}`);
console.log(
  'GTINs: 5397184119709 (Dell G5), 8806094724721 (Samsung S23); Brand=Philips ProductCode=HD9252/90; Sony → 403; Apple → 404 restricted',
);
const stop = async () => {
  await mock.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
