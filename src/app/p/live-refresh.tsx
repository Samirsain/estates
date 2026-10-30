"use client";

// Keeps an open Public Project Portal page live (owner, 29 Oct 2026: "latency
// near zero"). Every two seconds the page asks the server again, and the server reads the database
// again — nothing is cached anywhere — so a Plot put on Hold, Booked or sold in
// the CRM changes colour here without the visitor reloading. What the visitor
// has typed, filtered or opened stays as it is. A hidden tab is left alone and
// catches up the moment it is looked at again.
//
// ponytail: polls every 2 s per open page (a change shows within ~2–3 s); a
// database change feed (Supabase Realtime) for truly instant updates, or if
// visitors run into the hundreds at once.

import React from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 2_000;

export default function LiveRefresh() {
  const router = useRouter();

  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return null;
}
