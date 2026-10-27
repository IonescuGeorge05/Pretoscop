import { legalDocuments } from '@pretoscop/config/legal-texts';
import { Clock, Landmark, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ContactForm } from '@/components/contact/contact-form';
import { PageHeader } from '@/components/legal/legal-page';
import { Container } from '@/components/ui/container';
import { parseContactReference, readKindParam } from '@/lib/contact';
import { serverEnv } from '@/lib/db';
import { operatorFrom } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Scrie-ne: întrebări, erori de preț, cereri ale magazinelor de oprire a colectării, sesizări privind conținut ilegal (DSA) și solicitări privind datele personale.',
  alternates: { canonical: '/contact' },
};

function AsideBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-brand-700 [&>svg]:size-4">{icon}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft [&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline">{children}</div>
    </section>
  );
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const operator = operatorFrom(serverEnv());
  const initialKind = readKindParam(params.subiect);
  const sent = typeof params.trimis === 'string' && parseContactReference(params.trimis) !== null ? params.trimis : null;
  const serverError = typeof params.eroare === 'string' ? params.eroare : null;
  const mail = (address: string) => <a href={`mailto:${address}`}>{address}</a>;

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Contact"
        lead="O întrebare, un preț greșit, o cerere de oprire a colectării, o sesizare de conținut ilegal sau o solicitare privind datele tale: scrie-ne aici."
        doc={legalDocuments.contact}
      />
      <Container className="grid gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
        <div className="min-w-0 max-w-2xl">
          <ContactForm
            initialKind={initialKind}
            sentReference={sent}
            sentKind={readKindParam(params.tip)}
            serverError={serverError}
            fallbackEmail={operator.email}
          />
        </div>
        <aside className="space-y-4" aria-label="Alte căi de contact">
          <AsideBlock icon={<Clock />} title="Cât de repede răspundem">
            <p>
              Cererile magazinelor de oprire a colectării: răspuns și oprire în <strong className="text-ink">cel mult o zi lucrătoare</strong>.
            </p>
            <p>Solicitările privind datele personale: în cel mult o lună. Celelalte mesaje: cât mai repede.</p>
          </AsideBlock>
          <AsideBlock icon={<Mail />} title="Pe email">
            <p>General: {mail(operator.email)}</p>
            <p>Date personale: {mail(operator.privacyEmail)}</p>
            <p>Robotul PretoscopBot: {mail(operator.botEmail)}</p>
          </AsideBlock>
          <AsideBlock icon={<Landmark />} title="Punct unic de contact (DSA)">
            <p>
              Acest formular și adresa {mail(operator.email)} sunt punctul unic de contact pentru autorități și pentru utilizatori, conform art. 11 și 12 din
              Regulamentul (UE) 2022/2065 privind serviciile digitale. Comunicăm în limba română și în limba engleză.
            </p>
            <p>
              Operator: {operator.name}, {operator.address}.
            </p>
          </AsideBlock>
        </aside>
      </Container>
    </>
  );
}
