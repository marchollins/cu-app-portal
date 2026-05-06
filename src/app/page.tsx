import React from "react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Cedarville App Portal</h1>
      <p>
        Create a Cedarville-approved app, track its managed GitHub repository,
        and publish it to Azure with a portal-supported workflow.
      </p>
      <Link href="/create">Create New App</Link>
      {" | "}
      <Link href="/apps/add">Add Existing App</Link>
      {" | "}
      <Link href="/apps">My Apps</Link>
    </main>
  );
}
