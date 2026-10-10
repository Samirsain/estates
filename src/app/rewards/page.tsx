// Rewards — Change Pack §90 ("Monetary Benefits / Trip Rewards / Royalty
// Rewards / Recovery"). One place to see the open work across Bookings and
// Members. Read-only: every action is taken on the Booking or the Member it
// belongs to, which is where each row links. No rupee totals (CP §67).

import Link from "next/link";
import { requireStaff } from "@/lib/security/current-actor";
import { rewardLists } from "@/lib/rewards-overview";
import { eligibilityLabel } from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { REWARD_HOLD_LABEL } from "@/app/members/[id]/royalty-credits";

export const dynamic = "force-dynamic";

const TABS = [
  ["monetary", "Monetary Benefits"],
  ["trip", "Trip Rewards"],
  ["royalty", "Royalty Gifts"],
  ["recovery", "Recovery"],
] as const;

const TH = "px-2 py-1.5 text-left font-medium text-muted-foreground";
const TD = "px-2 py-1.5";

export default async function RewardsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireStaff("REPORT_VIEW");
  const { tab: requested } = await searchParams;
  const tab = TABS.some(([t]) => t === requested) ? requested! : "monetary";
  const lists = await rewardLists();
  const member = (personId: string) => `/people/${personId}?as=member`;

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-7xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Rewards</h1>
          <p className="text-xs text-muted-foreground">
            Project Direct, Customer Loyalty and Buying Commission are monetary; Trip and Royalty Gift are non-cash.
          </p>
        </header>
        <nav className="flex flex-wrap gap-1">
          {TABS.map(([t, label]) => (
            <Link
              key={t}
              href={`/rewards?tab=${t}`}
              className={`rounded-full px-3 py-1 text-xs ${t === tab ? "bg-primary text-primary-foreground" : "border border-border/60"}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <Card className="overflow-x-auto p-0">
          {tab === "monetary" && (
            <table className="w-full min-w-[44rem] text-xs">
              <thead className="border-b border-border/50">
                <tr>
                  <th className={TH}>Beneficiary</th>
                  <th className={TH}>Benefit</th>
                  <th className={TH}>Source</th>
                  <th className={TH}>Eligibility</th>
                  <th className={TH}>Payment</th>
                </tr>
              </thead>
              <tbody>
                {lists.monetary.map((c) => (
                  <tr key={c.id} className="border-b border-border/30">
                    <td className={TD}>{c.beneficiaryPerson.fullName}</td>
                    <td className={TD}>
                      {c.type === "LOYALTY"
                        ? c.beneficiaryRole === "CLOSING_CUSTOMER"
                          ? "Customer-closing Loyalty"
                          : "Repeat-purchase Loyalty"
                        : c.type === "DIRECT"
                          ? "Project Direct"
                          : "Buying Commission"}{" "}
                      {c.percent.toFixed(2)}%
                    </td>
                    <td className={TD}>
                      {c.booking ? (
                        <Link className="text-primary hover:underline" href={`/bookings?booking=${c.booking.id}`}>
                          {c.booking.bookingNumber} · {c.booking.project.name} {c.booking.plot.plotNumber}
                        </Link>
                      ) : (
                        <Link className="text-primary hover:underline" href={`/acquisitions/${c.acquisition?.id}`}>
                          {c.acquisition?.acquisitionNo}
                        </Link>
                      )}
                    </td>
                    <td className={TD}>
                      {eligibilityLabel(c.eligibility)}
                      {c.holdReason ? ` · ${c.holdReason.replaceAll("_", " ").toLowerCase()}` : ""}
                    </td>
                    <td className={TD}>{c.payment.replaceAll("_", " ").toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "trip" && (
            <table className="w-full min-w-[40rem] text-xs">
              <thead className="border-b border-border/50">
                <tr>
                  <th className={TH}>Member</th>
                  <th className={TH}>Programme</th>
                  <th className={TH}>Trip</th>
                  <th className={TH}>Earned</th>
                </tr>
              </thead>
              <tbody>
                {lists.trips.map((t) => (
                  <tr key={t.id} className="border-b border-border/30">
                    <td className={TD}>
                      <Link className="text-primary hover:underline" href={member(t.memberProfile.person.id)}>
                        {t.memberProfile.memberId} · {t.memberProfile.person.fullName}
                      </Link>
                    </td>
                    <td className={TD}>
                      {t.bucket.settingsVersion.project.name} · {t.bucket.programmeCode} · target {t.bucket.totalTarget}
                    </td>
                    <td className={TD}>
                      <Badge variant={t.state === "DEFICIENT" ? "destructive" : "info"}>{t.state.toLowerCase()}</Badge>
                      {t.holdReason && <span className="ml-1 text-amber-800">{REWARD_HOLD_LABEL[t.holdReason] ?? t.holdReason}</span>}
                    </td>
                    <td className={TD}>{formatIst(t.earnedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "royalty" && (
            <table className="w-full min-w-[40rem] text-xs">
              <thead className="border-b border-border/50">
                <tr>
                  <th className={TH}>Royalty Linked Member</th>
                  <th className={TH}>Customer · trigger</th>
                  <th className={TH}>Programme</th>
                  <th className={TH}>Gift</th>
                </tr>
              </thead>
              <tbody>
                {lists.gifts.map((g) => (
                  <tr key={g.id} className="border-b border-border/30">
                    <td className={TD}>
                      <Link className="text-primary hover:underline" href={member(g.memberProfile.person.id)}>
                        {g.memberProfile.memberId} · {g.memberProfile.person.fullName}
                      </Link>
                    </td>
                    <td className={TD}>
                      {g.customerProfile.customerId} ·{" "}
                      <Link className="text-primary hover:underline" href={`/bookings?booking=${g.triggerBooking.id}`}>
                        {g.triggerBooking.bookingNumber}
                      </Link>
                    </td>
                    <td className={TD}>{g.programmeVersion.programmeRef}</td>
                    <td className={TD}>
                      <Badge variant="info">{g.state.toLowerCase()}</Badge>
                      {g.selectedRewardRef ? ` ${g.selectedRewardRef}` : ""}
                      {g.holdReason && <span className="ml-1 text-amber-800">{REWARD_HOLD_LABEL[g.holdReason] ?? g.holdReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "recovery" && (
            <table className="w-full min-w-[40rem] text-xs">
              <thead className="border-b border-border/50">
                <tr>
                  <th className={TH}>Recovery</th>
                  <th className={TH}>Person</th>
                  <th className={TH}>Benefit</th>
                  <th className={TH}>Due</th>
                </tr>
              </thead>
              <tbody>
                {lists.recoveries.map((r) => (
                  <tr key={r.id} className="border-b border-border/30">
                    <td className={TD}>
                      {r.recoveryNo} · {r.reference}
                    </td>
                    <td className={TD}>
                      <Link className="text-primary hover:underline" href={`/people/${r.person.id}`}>
                        {r.person.fullName}
                      </Link>
                    </td>
                    <td className={TD}>
                      {r.commissionRecord.type}
                      {r.commissionRecord.booking && (
                        <>
                          {" · "}
                          <Link className="text-primary hover:underline" href={`/bookings?booking=${r.commissionRecord.booking.id}`}>
                            {r.commissionRecord.booking.bookingNumber}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className={`${TD} ${r.dueOn < new Date() ? "text-red-700" : ""}`}>{formatIst(r.dueOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
