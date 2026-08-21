import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "3% Club CRM — Real Estate Operating System",
  description: "Enterprise Plotted Real Estate CRM with Role-Based Access, Holds, Bookings, & Financial Governance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-background text-foreground overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}
