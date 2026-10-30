import Link from "next/link";

export const metadata = { title: "Dezabonat", robots: { index: false } };

export default function AlertUnsubscribed() {
  return (
    <div className="max-w-xl py-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Te-ai dezabonat</h1>
      <p className="mt-3 text-lg text-muted">Am șters alerta și adresa de email asociată ei. Nu mai primești nimic.</p>
      <Link href="/" className="mt-6 inline-block font-bold underline underline-offset-4">
        Înapoi la produse
      </Link>
    </div>
  );
}
