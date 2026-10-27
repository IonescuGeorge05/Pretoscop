import type { Env } from '@pretoscop/config/env';
import { directoryBody, DIRECTORY_MEDIA_TYPE, DIRECTORY_PATH, loadEd25519Key, signDirectoryResponse, type Ed25519Key } from '@pretoscop/fetch/signing';
import { resolveBotInfoUrl } from './bot-policy';

/**
 * Web Bot Auth on the web side (M21): the key directory at
 * /.well-known/http-message-signatures-directory and what /bot says about it. The worker signs
 * the requests; both read the same `WEB_BOT_AUTH_PRIVATE_KEY`.
 */

type BotAuthEnv = Pick<Env, 'WEB_BOT_AUTH' | 'WEB_BOT_AUTH_PRIVATE_KEY' | 'BOT_INFO_URL'>;

/** The directory response signature stays valid this long; caches keep the response for less. */
export const DIRECTORY_SIGNATURE_VALIDITY_SECONDS = 3600;
export const DIRECTORY_CACHE_SECONDS = 300;

export interface WebBotAuthStatus {
  /** The key directory is served (a key is configured). */
  keyPublished: boolean;
  /** The crawler signs its requests (`WEB_BOT_AUTH` on and a key configured). */
  signing: boolean;
  keyid: string | null;
  /** Value of the `Signature-Agent` header, without the quotes: the origin of the bot info URL. */
  agentOrigin: string;
  directoryUrl: string;
}

function keyOf(env: BotAuthEnv): Ed25519Key | null {
  if (!env.WEB_BOT_AUTH_PRIVATE_KEY) return null;
  try {
    return loadEd25519Key(env.WEB_BOT_AUTH_PRIVATE_KEY);
  } catch {
    return null; // getEnv() checked the shape; an unreadable key publishes nothing rather than crash /bot
  }
}

export function webBotAuthStatus(env: BotAuthEnv): WebBotAuthStatus {
  const key = keyOf(env);
  const agentOrigin = new URL(resolveBotInfoUrl(env.BOT_INFO_URL)).origin;
  return {
    keyPublished: key !== null,
    signing: key !== null && env.WEB_BOT_AUTH,
    keyid: key?.keyid ?? null,
    agentOrigin,
    directoryUrl: `${agentOrigin}${DIRECTORY_PATH}`,
  };
}

/**
 * GET /.well-known/http-message-signatures-directory: `{"keys":[<Ed25519 JWK>]}`, signed for the
 * public authority of the Signature-Agent (never for a Host header a client made up). 404 until a
 * key is configured.
 */
export function keyDirectoryResponse(env: BotAuthEnv, now: number = Date.now()): Response {
  const key = keyOf(env);
  if (!key) {
    return new Response('No Web Bot Auth key is published yet.\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const authority = new URL(webBotAuthStatus(env).agentOrigin).host;
  const signature = signDirectoryResponse({ keys: [key], authority, now, validitySeconds: DIRECTORY_SIGNATURE_VALIDITY_SECONDS });
  return new Response(directoryBody([key]), {
    status: 200,
    headers: {
      'content-type': DIRECTORY_MEDIA_TYPE,
      'cache-control': `public, max-age=${DIRECTORY_CACHE_SECONDS}`,
      'access-control-allow-origin': '*',
      ...signature,
    },
  });
}
