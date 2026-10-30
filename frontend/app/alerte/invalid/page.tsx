import Link from "next/link";

export const metadata = { title: "Link expirat", robots: { index: false } };

export default function AlertInvalid() {
  return (
    <div className="max-w-xl py-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Linkul nu mai e valabil</h1>
      <p className="mt-3 text-lg text-muted">
        Alertele neconfirmate se șterg după 48 de ore. Poți cere una nouă de pe pagina produsului.
      </p>
      <Link href="/" className="mt-6 inline-block font-bold underline underline-offset-4">
        Înapoi la produse
      </Link>
    </div>
  );
}
