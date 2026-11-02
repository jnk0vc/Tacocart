import Link from "next/link";

export default function NotFound() {
  return (
    <main className="sheet">
      <p className="eyebrow">Missing page</p>
      <h1>That recipe isn’t on the pass.</h1>
      <p className="dek">
        <Link href="/">Back to miso chicken tacos</Link>
      </p>
    </main>
  );
}
