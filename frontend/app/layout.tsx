import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MahaGuard AI — MahaRERA Legal Risk Audit Engine",
  description:
    "Enterprise-grade automated legal risk audit and extraction engine for Maharashtra Real Estate (MahaRERA) documents. Powered by AI with zero-hallucination citation verification.",
  keywords: ["MahaRERA", "legal audit", "real estate", "Maharashtra", "RERA compliance", "AI"],
  openGraph: {
    title: "MahaGuard AI",
    description: "Automated Legal Risk Audit Engine for MahaRERA Documents",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
