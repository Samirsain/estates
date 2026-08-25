import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Member Portal — 3% Real Estate Club",
  description: "Member Portal for 3% Real Estate Club",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-secondary text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* Soft Apple Parchment subtle background ambient radial blur */}
      <div className="pointer-events-none fixed inset-0 flex justify-center overflow-hidden">
        <div className="h-[500px] w-[900px] bg-gradient-to-br from-blue-500/5 via-sky-400/5 to-transparent blur-3xl opacity-70" />
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  );
}
