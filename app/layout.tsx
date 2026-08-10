import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniMarket",
  description:
    "Prediction markets resolved by GenLayer intelligence.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
