import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Cedarville App Portal</h1>
      <p>Create a Cedarville-approved app package and download the starter ZIP.</p>
      <Link href="/create">Create New App</Link>
    </main>
  );
}
