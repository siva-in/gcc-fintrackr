import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinTrackr - Financial Tracker",
  description: "Multi-organization financial tracking and approval management system",
  manifest: "/manifest.json",
  icons: {
    icon: "/gcc-globe.png",
    apple: "/gcc-globe.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a73e8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <head>
        <link rel="apple-touch-icon" href="/gcc-globe.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/gcc-globe.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/gcc-globe.png" />
        <link rel="apple-touch-icon" sizes="128x128" href="/gcc-globe.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FinTrackr" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
