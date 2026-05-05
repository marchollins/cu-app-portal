import React from "react";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span className="site-footer__brand">Cedarville University App Portal</span>
        <span>© {year} Cedarville University. All rights reserved.</span>
      </div>
    </footer>
  );
}
