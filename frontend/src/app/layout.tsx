import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BalanceLens",
  description: "AI decision support with RAG (free + local).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
