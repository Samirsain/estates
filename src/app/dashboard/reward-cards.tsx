// Change Pack §67 — operational cards for authorised staff. Counts only: the
// CRM keeps percentages and states, never rupee totals. Each card opens the
// matching list on the Rewards page.

import Link from "next/link";
import type { RewardCounts } from "@/lib/rewards-overview";

export function RewardCards({ counts }: { counts: RewardCounts }) {
  const cards: { label: string; value: string; href: string; warn?: boolean }[] = [
    { label: "Direct Ready / On Hold", value: `${counts.directReady} / ${counts.directHeld}`, href: "/rewards?tab=monetary" },
    { label: "Customer Loyalty Ready / On Hold", value: `${counts.loyaltyReady} / ${counts.loyaltyHeld}`, href: "/rewards?tab=monetary" },
    { label: "Recovery Outstanding", value: String(counts.recoveries), href: "/rewards?tab=recovery", warn: counts.recoveries > 0 },
    { label: "Trips awaiting fulfilment", value: String(counts.tripsAwaiting), href: "/rewards?tab=trip" },
    { label: "Trips Deficient", value: String(counts.tripsDeficient), href: "/rewards?tab=trip", warn: counts.tripsDeficient > 0 },
    { label: "Gifts awaiting selection", value: String(counts.giftsAwaitingSelection), href: "/rewards?tab=royalty" },
    { label: "Gifts ordered, awaiting delivery", value: String(counts.giftsAwaitingDelivery), href: "/rewards?tab=royalty" },
    { label: "Project settings awaiting MD", value: String(counts.settingsAwaitingMd), href: "/projects" },
    { label: "Reward reviews after Buyback", value: String(counts.buybackReviews), href: "/dashboard" },
    { label: "Conflict / circumvention reviews", value: String(counts.controlReviews), href: "/rewards?tab=reviews", warn: counts.controlReviews > 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
      {cards.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className="rounded-lg border border-border/60 bg-card p-2.5 transition-colors hover:border-primary/50"
        >
          <p className={`text-lg font-semibold tabular-nums ${c.warn ? "text-amber-700" : ""}`}>{c.value}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">{c.label}</p>
        </Link>
      ))}
    </div>
  );
}
