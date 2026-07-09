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
  title: "Katalog Sparepart Honda",
  description: "Aplikasi pencarian cepat kode sparepart motor Honda untuk kasir bengkel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#dc2626",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={[geistSans.variable, geistMono.variable, "h-full", "antialiased"].join(" ")}
    >
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  );
}
