import { SITE_BASE } from './config';
import { detectProduct } from './detect';
import { LOOKUP_MESSAGE, parseReply, type LookupRequest, type ParsedReply } from './messages';
import { buildPanel, HOST_ID, worthShowing } from './overlay';
import { domPage } from './page';
import { shopForHost } from './shops';

/**
 * Content script on the supported shops. On a product page it reads the product's identifiers
 * (detect.ts), asks the background worker for Pretoscop's data and, when there is something to
 * show, adds the panel. On any other page it sends nothing. It never changes the page itself: no
 * link, price or element of the shop is touched; the panel is one element of our own appended to
 * the document. It listens to no page event or `postMessage`: the page cannot talk to it.
 */
const shop = shopForHost(location.hostname);
/** Pages whose panel the user closed (this tab, this page view; nothing is stored). */
const closed = new Set<string>();
let current = location.href;

function sendLookup(req: LookupRequest): Promise<ParsedReply | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(req, (reply) => {
        // Reading lastError marks it handled (no console noise when the worker is restarting).
        resolve(chrome.runtime.lastError ? null : parseReply(reply));
      });
    } catch {
      resolve(null);
    }
  });
}

function removePanel(): void {
  document.getElementById(HOST_ID)?.remove();
}

async function run(afterNavigation: boolean): Promise<void> {
  if (!shop) return;
  const startedAt = location.href;
  const detection = detectProduct(domPage(document, startedAt), shop, { afterNavigation });
  if (!detection.productPage || !detection.ids || closed.has(detection.ids.url)) return;
  const reply = await sendLookup({ type: LOOKUP_MESSAGE, shop: shop.id, ids: detection.ids });
  // The user may have moved on (single-page shops) while we waited.
  if (location.href !== startedAt || !reply?.ok || !worthShowing(reply.data) || document.getElementById(HOST_ID)) return;
  const key = detection.ids.url;
  const host = buildPanel(document, reply.data, { shopId: shop.id, siteBase: SITE_BASE, now: Date.now(), onClose: () => closed.add(key) });
  document.documentElement.append(host);
}

if (shop) {
  void run(false);
  // Single-page shops (Altex is built with Next.js) change the address without a new page load:
  // look again, once the new product's content has had a moment to render.
  setInterval(() => {
    if (location.href === current) return;
    current = location.href;
    removePanel();
    setTimeout(() => void run(true), 800);
  }, 1000);
}
