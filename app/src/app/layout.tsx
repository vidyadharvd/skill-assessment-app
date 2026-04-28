import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skill Assessment",
  description:
    "Outcome-driven skill assessment platform — pick a function, role, subject and outcome, answer one scenario question, get per-skill scores.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
