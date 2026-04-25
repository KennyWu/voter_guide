import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Civic Influence Graph",
  description: "Explore mock civic influence relationships for a local voter guide demo."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
