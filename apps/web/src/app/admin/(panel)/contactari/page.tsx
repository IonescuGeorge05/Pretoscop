import { assistedMigrationStatus, outreach, shops, sql, type OutreachStatus } from '@pretoscop/db';
import { createOutreachAction, deleteOutreachAction, updateOutreachAction } from '@/app/admin/outreach-actions';
import { Section, Stat, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatDate, formatPercent } from '@/lib/format';
import { isContacted, OUTREACH_CHANNELS, OUTREACH_PURPOSES, OUTREACH_STATUSES, OUTREACH_TEMPLATES } from '@/lib/outreach';

const btn = 'h-9 rounded-lg px-3 text-sm font-semibold';
const field = 'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm';

const FLASH: Record<string, string> = {
  adaugat: 'Contactarea a fost adăugată.',
  actualizat: 'Contactarea a fost actualizată.',
  sters: 'Contactarea a fost ștearsă.',
};
const ERRORS: Record<string, string> = {
  campuri: 'Alege magazinul, scopul și canalul.',
  inexistent: 'Contactarea nu mai există.',
  contact: 'Contactul trebuie să fie o adresă de email de rol, adresa unui formular sau un număr de telefon al magazinului.',
  contact_personal: 'Nu păstrăm adrese personale (Gmail, Yahoo etc.): folosește adresa de rol a magazinului, de exemplu parteneriate@magazin.ro.',
  confirmare: 'Bifează confirmarea ca să ștergi contactarea.',
};

function Labeled({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-soft">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Retailer outreach tracker (M21, setup C3): requests for feeds and allowlisting, the answers,
 * and the exit of every shop read through the assisted channel (docs/12 §2b). Admin only (the
 * panel layout and every action call `requireAdmin`).
 */
export default async function OutreachAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const [rows, shopList, assisted] = await Promise.all([
    db()
      .select({ o: outreach, shopName: shops.name, shopSlug: shops.slug, shopStatus: shops.status })
      .from(outreach)
      .innerJoin(shops, sql`${shops.id} = ${outreach.shopId}`)
      .orderBy(sql`${outreach.createdAt} DESC`, sql`${outreach.id} DESC`)
      .limit(500),
    db().select({ id: shops.id, name: shops.name, status: shops.status }).from(shops).orderBy(shops.name),
    assistedMigrationStatus(db()),
  ]);
  const contacted = new Set(rows.filter((r) => isContacted(r.o.status)).map((r) => r.o.shopId));
  const agreed = new Set(rows.filter((r) => r.o.status === 'agreed').map((r) => r.o.shopId));
  const now = new Date();
  const due = rows.filter((r) => r.o.nextStepAt && r.o.nextStepAt <= now && !['agreed', 'declined'].includes(r.o.status));
  const today = now.toISOString().slice(0, 10);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Contactări magazine</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Cereri de feed sau de acces pentru PretoscopBot (șabloane în <code>infra/bot-program/outreach-templates.md</code>). Emailurile le trimit fondatorii; aici
        notăm ce s-a trimis și ce au răspuns magazinele. Păstrăm doar canale de afaceri (adrese de rol, formulare, centrale), nu date despre persoane.
      </p>
      {q.ok && FLASH[q.ok] && (
        <p role="status" className="mb-4 rounded-lg bg-good-bg px-3 py-2 text-sm text-good">
          {FLASH[q.ok]}
        </p>
      )}
      {q.eroare && (
        <p role="alert" className="mb-4 rounded-lg bg-high-bg px-3 py-2 text-sm text-high">
          {ERRORS[q.eroare] ?? 'Ceva nu a mers.'}
        </p>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Magazine contactate" value={<span data-testid="outreach-contacted">{contacted.size}</span>} hint="cel puțin o cerere trimisă" />
        <Stat label="Acorduri" value={agreed.size} hint="feed primit sau acces permis" />
        <Stat label="De revenit azi" value={due.length} hint="pasul următor a ajuns la termen" />
      </div>

      <Section title="Adaugă o contactare">
        <form action={createOutreachAction} className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="outreach-form">
          <Labeled id="o-shop" label="Magazin">
            <select id="o-shop" aria-labelledby="o-shop-label" name="shopId" required className={field}>
              <option value="">—</option>
              {shopList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="o-purpose" label="Scop">
            <select id="o-purpose" aria-labelledby="o-purpose-label" name="purpose" required className={field}>
              {Object.entries(OUTREACH_PURPOSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="o-channel" label="Canal">
            <select id="o-channel" aria-labelledby="o-channel-label" name="channel" required className={field}>
              {Object.entries(OUTREACH_CHANNELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="o-template" label="Șablon">
            <select id="o-template" aria-labelledby="o-template-label" name="template" className={field}>
              <option value="">—</option>
              {Object.entries(OUTREACH_TEMPLATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="o-contact" label="Contact (adresă de rol, formular, centrală)" hint="Fără nume de persoane și fără adrese personale.">
            <input id="o-contact" aria-labelledby="o-contact-label" name="contact" maxLength={200} aria-describedby="o-contact-hint" className={field} placeholder="parteneriate@magazin.ro" />
          </Labeled>
          <Labeled id="o-status" label="Stare">
            <select id="o-status" aria-labelledby="o-status-label" name="status" defaultValue="sent" className={field}>
              {Object.entries(OUTREACH_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="o-sent" label="Trimis la">
            <input id="o-sent" aria-labelledby="o-sent-label" name="sentAt" type="date" defaultValue={today} className={field} />
          </Labeled>
          <Labeled id="o-next" label="Revenim la">
            <input id="o-next" aria-labelledby="o-next-label" name="nextStepAt" type="date" className={field} />
          </Labeled>
          <div className="sm:col-span-2 lg:col-span-3">
            <Labeled id="o-answer" label="Răspuns / note" hint="Un rezumat al răspunsului, fără date personale.">
              <input id="o-answer" aria-labelledby="o-answer-label" name="answer" maxLength={2000} aria-describedby="o-answer-hint" className={field} />
            </Labeled>
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btn} bg-brand-600 text-white`}>
              Adaugă
            </button>
          </div>
        </form>
      </Section>

      <Section title="Istoric">
        <Table head={['Magazin', 'Scop și canal', 'Trimis', 'Stare și răspuns', 'Actualizează', 'Șterge']}>
          {rows.map(({ o, shopName, shopStatus }) => (
            <tr key={o.id} data-testid={`outreach-row-${o.id}`}>
              <Td>
                <span className="font-medium">{shopName}</span>
                <div className="text-xs text-muted">{shopStatus}</div>
              </Td>
              <Td>
                {OUTREACH_PURPOSES[o.purpose]}
                <div className="text-xs text-muted">
                  {OUTREACH_CHANNELS[o.channel]}
                  {o.contact ? ` · ${o.contact}` : ''}
                  {o.template ? ` · ${OUTREACH_TEMPLATES[o.template] ?? o.template}` : ''}
                </div>
              </Td>
              <Td>{o.sentAt ? formatDate(o.sentAt) : '—'}</Td>
              <Td>
                {OUTREACH_STATUSES[o.status as OutreachStatus]}
                {o.answer && <div className="text-xs text-muted">{o.answer}</div>}
                {o.nextStepAt && <div className="text-xs text-muted">revenim la {formatDate(o.nextStepAt)}</div>}
              </Td>
              <Td>
                <form action={updateOutreachAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="outreachId" value={o.id} />
                  <select name="status" defaultValue={o.status} aria-label={`Stare pentru ${shopName}`} className="h-9 rounded-lg border border-line bg-white px-2 text-sm">
                    {Object.entries(OUTREACH_STATUSES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <input name="answer" aria-label={`Răspuns de la ${shopName}`} placeholder="răspuns" maxLength={2000} className="h-9 w-40 rounded-lg border border-line px-2 text-sm" />
                  <input name="nextStepAt" type="date" aria-label={`Revenim la (${shopName})`} className="h-9 rounded-lg border border-line px-2 text-sm" />
                  <button type="submit" className={`${btn} bg-white ring-1 ring-line`}>
                    Salvează
                  </button>
                </form>
              </Td>
              <Td>
                <form action={deleteOutreachAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="outreachId" value={o.id} />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="confirm" value="da" required aria-label={`Confirm ștergerea contactării pentru ${shopName}`} />
                    confirm
                  </label>
                  <button type="submit" className={`${btn} bg-white text-high ring-1 ring-line`}>
                    Șterge
                  </button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Ieșirea din accesul asistat">
        <div className="p-3">
          <p className="mb-3 text-sm text-ink-soft">
            Accesul asistat este o punte (docs/12-blocked-shops-strategy.md §2b): fiecare magazin citit așa trece la un feed sau la o regulă care permite
            PretoscopBot. Odată ce înlocuitorul funcționează, oprim accesul asistat pentru acel magazin. Revizuire lunară: rata de succes, costul (din
            registrul de costuri al canalului) și stadiul contactării. Țintă: sub jumătate din magazinele desemnate încă pe acces asistat în luna a 6-a.
          </p>
          {assisted.length === 0 ? (
            <p className="text-sm text-muted" data-testid="assisted-none">
              Niciun magazin nu folosește acum accesul asistat.
            </p>
          ) : (
            <Table head={['Magazin', 'Cereri 30 de zile', 'Succes', 'Feed înlocuitor', 'Ultima contactare', 'Revenim la']}>
              {assisted.map((a) => (
                <tr key={a.shopId} data-testid={`assisted-${a.slug}`}>
                  <Td>
                    <span className="font-medium">{a.name}</span>
                    <div className="text-xs text-muted">{a.legalBasisRef ?? 'fără referință juridică'}</div>
                  </Td>
                  <Td>{a.requests30d}</Td>
                  <Td>{a.successRate30d === null ? '—' : formatPercent(a.successRate30d)}</Td>
                  <Td>{a.feedLive ? 'da, rulează: oprește accesul asistat' : 'nu încă'}</Td>
                  <Td>
                    {a.outreachStatus ? OUTREACH_STATUSES[a.outreachStatus] : 'necontactat'}
                    {a.outreachAt && <div className="text-xs text-muted">{formatDate(a.outreachAt)}</div>}
                  </Td>
                  <Td>{a.nextStepAt ? formatDate(a.nextStepAt) : '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Section>
    </div>
  );
}
