import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Katalog Sparepart Honda",
  description:
    "Aplikasi pencarian cepat kode sparepart motor Honda untuk kasir bengkel",
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
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  );
}
