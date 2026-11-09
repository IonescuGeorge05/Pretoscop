import { serverEnv } from '@/lib/db';
import { keyDirectoryResponse } from '@/lib/web-bot-auth';

// Signed per request (the signature carries created/expires); the key comes from the environment.
export const dynamic = 'force-dynamic';

/**
 * GET /.well-known/http-message-signatures-directory — the Web Bot Auth key directory of
 * PretoscopBot (M21; draft-meunier-http-message-signatures-directory). Verifiers such as
 * Cloudflare fetch it to check the `Signature` headers of our crawler's requests.
 */
export function GET(): Response {
  return keyDirectoryResponse(serverEnv());
}
