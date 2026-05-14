import React from "react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="hero">
        <h1>Cedarville App Portal</h1>
        <p>
          Create Cedarville-approved apps, store your code on GitHub (an online
          platform for managing and sharing code), and publish directly to Azure
          (Microsoft&rsquo;s cloud hosting service) — all from one place.
        </p>
        <div className="hero__actions">
          <Link href="/create" className="btn btn--secondary-solid btn--lg">
            Create New App
          </Link>
          <Link
            href="/apps/add"
            className="btn btn--ghost btn--lg"
            style={{
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.3)",
            }}
          >
            Add Existing App
          </Link>
          <Link
            href="/apps"
            className="btn btn--ghost btn--lg"
            style={{
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.3)",
            }}
          >
            My Apps
          </Link>
        </div>
      </div>

      <p className="section-title">How it works</p>
      <div className="grid grid--3">
        <div className="card card--navy-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🛠️</p>
          <div className="card__title">Generate</div>
          <p className="card__desc">
            Pick a Cedarville-approved template, fill in your project details,
            and the portal generates a ready-to-use app package in seconds.
          </p>
        </div>
        <div className="card card--gold-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>📦</p>
          <div className="card__title">Track</div>
          <p className="card__desc">
            The portal sets up a private GitHub repository — an online space
            where your app&rsquo;s code is stored. Add your GitHub username and
            Codex (an AI coding assistant) can open the code, make your
            customizations, and save the changes.
          </p>
        </div>
        <div className="card card--navy-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🚀</p>
          <div className="card__title">Publish</div>
          <p className="card__desc">
            Deploy your app to Azure directly from this portal — no extra
            software needed on your computer. Return here to trigger and
            monitor your app going live.
          </p>
        </div>
      </div>
    </main>
  );
}
