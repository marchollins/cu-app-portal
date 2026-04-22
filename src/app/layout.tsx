import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Cedarville App Portal",
  description: "Create Cedarville-approved Codex app packages.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
