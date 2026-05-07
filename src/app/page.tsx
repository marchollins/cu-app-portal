import React from "react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="hero">
        <h1>Cedarville App Portal</h1>
        <p>
          Create Cedarville-approved apps, track your managed GitHub repository,
          and publish directly to Azure — all from one place.
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
            A managed GitHub repository is automatically set up for Codex
            handoff. Grant access and let Codex clone, customize, and commit.
          </p>
        </div>
        <div className="card card--navy-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🚀</p>
          <div className="card__title">Publish</div>
          <p className="card__desc">
            Deploy to Azure with a portal-supported workflow — no local Azure
            tooling required. Return here to trigger and monitor your deploy.
          </p>
        </div>
      </div>
    </main>
  );
}
