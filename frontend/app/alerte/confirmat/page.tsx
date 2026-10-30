import Link from "next/link";

export const metadata = { title: "Alertă confirmată", robots: { index: false } };

export default function AlertConfirmed() {
  return (
    <div className="max-w-xl py-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Gata, alerta e pornită</h1>
      <p className="mt-3 text-lg text-muted">
        Îți scriem când prețul ajunge unde ai cerut. Fiecare email are un link de dezabonare, care îți șterge adresa.
      </p>
      <Link href="/" className="mt-6 inline-block font-bold underline underline-offset-4">
        Înapoi la produse
      </Link>
    </div>
  );
}
