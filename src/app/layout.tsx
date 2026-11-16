import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  weight: ["600", "700", "800"],
  variable: "--font-display",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IEEE Grand Prix — Live Coding Circuit",
  description:
    "Live multiplayer strategic web development racing quiz with real-time broadcast telemetry and server-authoritative timing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${barlowCondensed.variable} ${geistSans.variable} ${geistMono.variable} font-sans min-h-screen bg-[#080B10] text-[#F5F7FA] antialiased selection:bg-[#00D4FF] selection:text-[#080B10]`}
      >
        {children}
      </body>
    </html>
  );
}
