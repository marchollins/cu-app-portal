import React from "react";
import Link from "next/link";

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;

  return (
    <main>
      <h1>Your App Package Is Ready</h1>
      <p>
        Download the ZIP package and follow the guided GitHub and deployment
        steps.
      </p>
      <Link href={`/api/download/${requestId}`}>Download ZIP</Link>
      <ol>
        <li>Create a new GitHub repository.</li>
        <li>Extract the ZIP package.</li>
        <li>Commit the generated files to the repository.</li>
        <li>Follow the included deployment guide.</li>
      </ol>
    </main>
  );
}
