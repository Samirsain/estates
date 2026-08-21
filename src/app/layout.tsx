import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "3% Club CRM — Real Estate Operating System",
  description: "Enterprise Plotted Real Estate CRM with Role-Based Access, Holds, Bookings, & Financial Governance",
  // Internal system. Nothing here should ever reach a search index, and the
  // referrer must not carry a record URL to any site a user navigates to.
  robots: { index: false, follow: false, nocache: true },
  referrer: "strict-origin-when-cross-origin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/*
        Browser extensions add attributes to <body> before React hydrates —
        ColorZilla adds cz-shortcut-listen, password managers add their own. The
        server never sent those, so React reports a mismatch that is nobody's
        bug. This silences it for this element's attributes only; a real
        mismatch inside the app still reports normally.
      */}
      <body
        suppressHydrationWarning
        className="min-h-screen bg-background text-foreground overflow-x-hidden"
      >
        {children}
      </body>
    </html>
  );
}
