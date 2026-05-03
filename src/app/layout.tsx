import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Instamenu",
  description: "Snap a menu. Order instantly.",
  openGraph: {
    title: "Instamenu",
    description: "Snap a menu. Order instantly.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-950 text-gray-100 min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
