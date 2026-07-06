import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "WH40K — Detachment & Disposition Matrix",
  description: "11th edition detachment and disposition overview",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da" className={`${inter.variable} h-full`}>
      <body className="min-h-full font-[family-name:var(--font-inter)] bg-[#0f0f13] text-[#e8e8f0] text-sm leading-relaxed antialiased">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
