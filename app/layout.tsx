import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://omnimarket-two.vercel.app"),
  title: {
    default: "OmniMarket | Evidence-settled prediction markets",
    template: "%s | OmniMarket",
  },
  description: "Public two-outcome prediction markets with native GEN, live contract state, and GenLayer evidence settlement.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "OmniMarket | Evidence-settled prediction markets",
    description: "Trade native-GEN positions and follow settlement from live evidence on GenLayer Bradbury.",
    siteName: "OmniMarket",
  },
  twitter: {
    card: "summary",
    title: "OmniMarket | Evidence-settled prediction markets",
    description: "Native-GEN prediction markets settled by GenLayer evidence consensus.",
  },
  robots: { index: true, follow: true },
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
