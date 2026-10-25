import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Pagina nu există</h1>
      <Link href="/" className="mt-4 inline-block text-brand underline">
        Înapoi la modelele PS5
      </Link>
    </div>
  );
}
