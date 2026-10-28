import type { ConsentText } from '@pretoscop/config/legal-texts';
import Link from 'next/link';
import { startTelegramLinkAction, unlinkTelegramAction } from '@/app/(site)/alerte/actions';
import { Button } from '@/components/ui/button';
import type { UserChannels } from '@/lib/channels';
import { formatDateTime } from '@/lib/format';
import { PushControls } from './push-controls';

const linkOf = (c: ConsentText) => ({ key: c.key, text: c.text, link: { href: c.link.href, label: c.link.label } });

/**
 * "Canale de notificare" on /alerte (M27): email (always), browser notifications (Web Push) and
 * Telegram, each with its own consent text; alerts pick a channel in "Modifică".
 */
export function ChannelsSection({
  email,
  ch,
  telegramToken,
  pushConsent,
  telegramConsent,
}: {
  email: string;
  ch: UserChannels;
  /** Set right after "Conectează Telegram": the one-time token of the deep link. */
  telegramToken: string | null;
  pushConsent: ConsentText;
  telegramConsent: ConsentText;
}) {
  const token = telegramToken && /^[A-Za-z0-9_-]{20,64}$/.test(telegramToken) ? telegramToken : null;
  return (
    <section id="canale" aria-labelledby="canale-titlu" className="space-y-5 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-5">
      <div>
        <h2 id="canale-titlu" className="text-lg font-semibold">
          Canale de notificare
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Alegi canalul fiecărei alerte din „Modifică”. Pentru fiecare canal îți cerem acordul separat și îl poți opri oricând.</p>
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold text-ink">Email</h3>
        <p className="text-sm text-ink-soft">La {email}. Fiecare email are linkul de dezabonare.</p>
      </div>

      <div className="space-y-2" data-testid="channel-push">
        <h3 className="font-semibold text-ink">Notificări în browser</h3>
        {ch.pushKey ? (
          <>
            {ch.pushDevices.length > 0 && (
              <ul className="space-y-1 text-sm text-ink-soft">
                {ch.pushDevices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2" data-testid="push-device">
                    <span>
                      {d.deviceLabel ?? 'Dispozitiv'}, activ din {formatDateTime(d.createdAt)}
                    </span>
                    <form action="/api/push/unsubscribe" method="post">
                      <input type="hidden" name="id" value={d.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Elimină
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <PushControls vapidPublicKey={ch.pushKey} consent={linkOf(pushConsent)} />
          </>
        ) : (
          <p className="text-sm text-ink-soft">Notificările în browser pornesc în curând.</p>
        )}
      </div>

      <div className="space-y-2" data-testid="channel-telegram">
        <h3 className="font-semibold text-ink">Telegram</h3>
        {!ch.telegramBot ? (
          <p className="text-sm text-ink-soft">Alertele pe Telegram pornesc în curând.</p>
        ) : ch.telegram ? (
          <div className="space-y-2 text-sm text-ink-soft">
            <p>
              Conectat din {formatDateTime(ch.telegram.linkedAt)}.
              {ch.telegram.status === 'blocked' && ' Ai blocat robotul în Telegram: deblochează-l și conectează-te din nou ca să primești alertele.'}
            </p>
            <form action={unlinkTelegramAction}>
              <Button type="submit" size="sm" variant="secondary">
                Deconectează Telegram
              </Button>
            </form>
          </div>
        ) : token ? (
          <div className="space-y-2 text-sm text-ink-soft">
            <p>Deschide Telegram și apasă „Start” în conversația cu robotul. Linkul expiră în 15 minute și merge o singură dată.</p>
            <a
              href={`https://t.me/${ch.telegramBot}?start=${token}`}
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700"
              rel="noopener noreferrer"
              target="_blank"
              data-testid="telegram-deep-link"
            >
              Deschide Telegram
            </a>
          </div>
        ) : (
          <form action={startTelegramLinkAction} className="space-y-2">
            <div className="flex items-start gap-2.5">
              <input id="telegram-consent" aria-labelledby="telegram-consent-label" name="telegramConsent" type="checkbox" required className="mt-1 size-4 shrink-0 accent-brand-600" />
              <label id="telegram-consent-label" htmlFor="telegram-consent" className="text-[13px] leading-snug text-ink-soft">
                {telegramConsent.text}{' '}
                <Link href={telegramConsent.link.href} className="text-brand-700 underline">
                  {telegramConsent.link.label}
                </Link>
              </label>
            </div>
            <Button type="submit" size="sm">
              Conectează Telegram
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
