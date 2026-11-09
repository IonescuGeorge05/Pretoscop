import { API_BASE } from './config';
import { LOOKUP_MESSAGE, type LookupReply } from './messages';
import { createLookupService } from './service';

/**
 * Background worker (a service worker in Chrome, an event page in Firefox). It answers one
 * message, the content script's lookup, and makes the only network request of the extension:
 * GET {API_BASE}/api/ext/lookup with the page's identifiers. Nothing is stored; there is no
 * telemetry, no other listener and no other request.
 */
const service = createLookupService({ apiBase: API_BASE, extensionId: chrome.runtime.id, fetch: (url, init) => fetch(url, init) });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== LOOKUP_MESSAGE) return false;
  service.handle(message, sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'unavailable' } satisfies LookupReply));
  return true; // answered asynchronously
});
