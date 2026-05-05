import React from "react";
import Link from "next/link";
import { LogoutButton } from "@/features/auth/logout-button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <div className="site-header__logo-mark">CU</div>
          <div>
            <span className="site-header__title">App Portal</span>
            <span className="site-header__subtitle">Cedarville University</span>
          </div>
        </Link>

        <nav className="site-header__nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/create">Create App</Link>
          <Link href="/apps">My Apps</Link>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
