/**
 * Creates a Web Bot Auth key (M21):
 *
 *   pnpm --filter @pretoscop/fetch bot-auth:keygen
 *
 * Prints the private key in the `WEB_BOT_AUTH_PRIVATE_KEY` format (base64url Ed25519 seed), the
 * public JWK that /.well-known/http-message-signatures-directory will publish and its keyid
 * (JWK thumbprint). Put the secret in the production secret store / server `.env` of BOTH the
 * worker (signs requests) and the web app (signs the key directory). Never commit it and never
 * paste it into a ticket or chat; only the JWK and the keyid are public.
 * See infra/bot-program/web-bot-auth.md for the rollout and rotation steps.
 */
import { generateEd25519Key } from '../signing';

const { secret, key } = generateEd25519Key();
process.stdout.write(
  [
    '# Secret: environment only (worker and web). Never commit, never share.',
    `WEB_BOT_AUTH_PRIVATE_KEY=${secret}`,
    '',
    '# Public (published in the key directory):',
    `keyid: ${key.keyid}`,
    `jwk:   ${JSON.stringify(key.jwk)}`,
    '',
  ].join('\n'),
);
