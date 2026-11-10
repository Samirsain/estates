"use client";

// A single deal, and every action it can take.
//
// The list keeps one button — Payment — because that is the one thing done
// against a row while scanning a list. Approve, Reject, Cancel, Record Buying
// Commission and Correct all need the record in front of you, so they live
// here.

import React from "react";
import { safely } from "@/lib/safely";
import { ModalError } from "@/components/ui/modal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Check, CheckCircle2, Coins, PencilLine, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PersonLink } from "@/components/person-link";
import { formatIst, istDay, type StaffRole } from "@/lib/tasks";
import { AcquisitionDialogs } from "../acquisition-dialogs";
import { recordDocumentsReturnedAction, type ActionResult } from "../actions";
import {
  STATUS_LABEL,
  TYPE_LABEL,
  type AcquisitionRowView,
  type Dialog,
  type Permissions,
  type PersonView,
} from "../types";

const CTH = "px-2 pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const CTD = "px-2 py-2.5 text-center align-middle";
const ROLE_TD = "px-2 py-2.5 text-left align-middle text-muted-foreground";

export default function AcquisitionDetailClient({
  role,
  actorName,
  staffAccountId,
  permissions,
  row,
  people,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  permissions: Permissions;
  row: AcquisitionRowView;
  people: PersonView[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await safely(action);
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  const live = row.status === "PENDING_APPROVAL" || row.status === "APPROVED";
  // Entries come newest first (row-view orders by recordedAt desc).
  const latestConfirmed = row.entries.find((e) => e.status === "CONFIRMED");

  return (
    // The refusal shows inside the open dialog; behind it, nobody saw it.
    <ModalError.Provider value={notice && !notice.ok ? notice.text : null}>
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Every action the deal can take, on the top line beside Back as on
            the Booking page (owner, 3 Nov 2026). Payment is here too — the list
            button opens the same dialog, so neither place is the only way through. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/acquisitions"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Buyback / Resale
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {live && permissions.confirmGiven && (
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "PAY", row })}>
                <Wallet className="mr-2 h-3.5 w-3.5" /> Confirm Payment Given
              </Button>
            )}
            {/* One Correct, opening on the latest confirmed entry; the form picks
                another when there are several (as Correct Payment Received). */}
            {live && permissions.correctGiven && latestConfirmed && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog({ kind: "CORRECT", row, entry: latestConfirmed })}
              >
                <PencilLine className="mr-2 h-3.5 w-3.5" /> Correct Payment Given
              </Button>
            )}
            {row.status === "PENDING_APPROVAL" && permissions.decide && (
              <>
                <Button size="sm" onClick={() => setDialog({ kind: "DECIDE", row, approve: true })}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog({ kind: "DECIDE", row, approve: false })}
                >
                  Reject
                </Button>
              </>
            )}
            {live &&
              permissions.recordCommission &&
              !row.commission &&
              row.arrangedByType !== "THREE_PERCENT_CLUB" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ kind: "COMMISSION", row })}
                >
                  <Coins className="mr-2 h-3.5 w-3.5" /> Record Buying Commission
                </Button>
              )}
            {row.status === "APPROVED" &&
              row.documentsReturnRequired &&
              !row.documentsReturnedAt &&
              ["CRM", "MD"].includes(role) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      recordDocumentsReturnedAction(
                        row.id,
                        istDay(new Date()),
                        `docs-${row.id}-${Date.now()}`
                      )
                    )
                  }
                >
                  Papers back
                </Button>
              )}
            {live && permissions.cancel && (
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "CANCEL", row })}>
                <Ban className="mr-2 h-3.5 w-3.5" /> Cancel deal
              </Button>
            )}
          </div>
        </div>

        {notice && (
          <Card
            className={`p-4 text-sm ${
              notice.ok ? "border-emerald-500/40 text-emerald-700" : "border-red-500/40 text-red-700"
            }`}
          >
            {notice.text}
          </Card>
        )}

        {/* What this deal is, in one line: kind, reference, property, state. */}
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {TYPE_LABEL[row.type] ?? row.type}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{row.property}</span>
                <Badge
                  variant={
                    row.status === "APPROVED"
                      ? "success"
                      : row.status === "PENDING_APPROVAL"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {STATUS_LABEL[row.status] ?? row.status}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Stat label="Payment Given" value={`${row.paymentGivenPercent}%`} />
              <Stat label="Purchase Date" value={formatIst(row.purchaseDate)} />
              {row.type === "BUYBACK" && row.status === "APPROVED" && (
                <Stat
                  label="Stable Buyback Completion"
                  value={
                    row.stableCompletedAt
                      ? `Yes · ${formatIst(row.stableCompletedAt)}`
                      : row.documentsReturnRequired && !row.documentsReturnedAt
                        ? "No · papers not back"
                        : "No · Payment Given below 100%"
                  }
                />
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Owner 3 Nov — the same hairline rows as the tables beside it. */}
          <Section title="Details">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border/40">
            <Row label="Deal" value={TYPE_LABEL[row.type] ?? row.type} />
            <Row label="Project" value={row.project} />
            <Row label="Plot No." value={row.plotNumber} />
            {row.plotType && (
              <Row label="Plot Type" value={row.plotType.replaceAll("_", " ")} />
            )}
            {row.location && <Row label="Location" value={row.location} />}
            <Row label="Raised by" value={row.submittedByRef} />
            <Row label="Remark" value={row.remark} />
            {row.sourceBooking && <Row label="Old Booking" value={row.sourceBooking} />}
            {row.decisionNote && <Row label="Decision" value={row.decisionNote} />}
            {row.closedReason && <Row label="Closed" value={row.closedReason} />}
              </tbody>
            </table>
          </Section>

          {/* Owner 3 Nov — two halves split by one hairline: who sells and who
              arranged it (ID, Name), then the Buying Commission (ID, Name, %,
              Status) with a tick to mark it paid. */}
          <Section title="Parties">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border/60">
                  <tr>
                    <th className={CTH.replace("text-center", "text-left")}>
                      <span className="sr-only">Role</span>
                    </th>
                    <th className={CTH}>ID</th>
                    <th className={CTH}>Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr>
                    <td className={ROLE_TD}>Seller</td>
                    <td className={`${CTD} tabular-nums`}>{row.sellerCode ?? "—"}</td>
                    <td className={CTD}>
                      <PersonLink personId={row.sellerPersonId} name={row.seller} />
                    </td>
                  </tr>
                  <tr>
                    <td className={ROLE_TD}>Arranged by</td>
                    <td className={`${CTD} tabular-nums`}>{row.arrangedByCode ?? "—"}</td>
                    <td className={CTD}>
                      <PersonLink
                        personId={row.arrangedByPersonId}
                        name={row.arrangedBy}
                        as={row.arrangedByType === "MEMBER" ? "member" : undefined}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border-t border-border/60 pt-3">
              <h3 className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Buying Commission
              </h3>
              {row.commission ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border/60">
                      <tr>
                        <th className={CTH}>ID</th>
                        <th className={CTH}>Name</th>
                        <th className={CTH}>%</th>
                        <th className={CTH}>Status</th>
                        <th className={CTH}>Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className={`${CTD} tabular-nums`}>{row.commission.beneficiaryCode ?? "—"}</td>
                        <td className={CTD}>
                          <PersonLink
                            personId={row.commission.beneficiaryPersonId}
                            name={row.commission.beneficiary}
                          />
                        </td>
                        <td className={`${CTD} tabular-nums`}>{row.commission.percent}%</td>
                        <td className={`${CTD} tabular-nums`}>
                          {commissionStatus(row.commission)}
                          {row.commission.paidOn && (
                            <span className="block text-[11px] text-muted-foreground">
                              {formatIst(row.commission.paidOn)}
                            </span>
                          )}
                        </td>
                        <td className={CTD}>
                          <CommissionTick
                            commission={row.commission}
                            canPay={permissions.payCommission}
                            onPay={(early) => setDialog({ kind: "COMMISSION_PAID", row, early })}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {row.arrangedByType === "THREE_PERCENT_CLUB"
                    ? "A 3% Club deal earns no Buying Commission."
                    : "Not recorded yet."}
                </p>
              )}
            </div>
          </Section>

          <Section title="Payment Given schedule">
            {row.instalments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No live schedule.</p>
            ) : (
              // Owner 3 Nov — the Booking Payment Schedule's table: the due date
              // with its percentage under it, and Given the same way.
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border/60">
                    <tr>
                      <th className={CTH}>#</th>
                      <th className={CTH}>Due Date</th>
                      <th className={CTH}>Given</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {row.instalments.map((i) => (
                      <tr key={i.seq}>
                        <td className={CTD}>{i.seq}</td>
                        <td className={`${CTD} tabular-nums`}>
                          {formatIst(i.dueDate)}
                          <span className="block text-[11px] text-muted-foreground">{i.scheduled}%</span>
                        </td>
                        <td className={`${CTD} tabular-nums`}>
                          {i.givenOn ? formatIst(i.givenOn) : "—"}
                          <span className="block text-[11px] text-muted-foreground">{i.received}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Payment Given Details">
            {row.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing confirmed yet.</p>
            ) : (
              // Owner 3 Nov — Sr No, Reference No, Date, % as on the Booking's
              // Received Payment Details. A corrected entry sits last, struck through.
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border/60">
                    <tr>
                      <th className={CTH}>Sr No</th>
                      <th className={CTH}>Reference No</th>
                      <th className={CTH}>Date</th>
                      <th className={CTH}>%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {[...row.entries]
                      .sort((a, b) => Number(a.status === "SUPERSEDED") - Number(b.status === "SUPERSEDED"))
                      .map((entry, index) => (
                        <tr
                          key={entry.id}
                          className={entry.status === "SUPERSEDED" ? "text-muted-foreground line-through" : undefined}
                        >
                          <td className={`${CTD} tabular-nums`}>{index + 1}</td>
                          <td className={CTD}>{entry.reference}</td>
                          <td className={`${CTD} tabular-nums`}>{formatIst(entry.paidOn)}</td>
                          <td className={`${CTD} tabular-nums`}>{entry.percent}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      </div>

      <AcquisitionDialogs
        dialog={dialog}
        people={people}
        busy={busy}
        run={run}
        onClose={() => setDialog(null)}
      />
    </AppShell>
    </ModalError.Provider>
  );
}

type Commission = NonNullable<AcquisitionRowView["commission"]>;

const PAYMENT_LABEL: Record<string, string> = {
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Recovery Pending",
  CANCELLED: "Cancelled",
};

/** One Status: how it was paid once it is, else how close it is to payable. */
function commissionStatus(c: Commission) {
  if (c.payment !== "NOT_PAID") return PAYMENT_LABEL[c.payment] ?? c.payment;
  return c.eligibility.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * The tick that pays a Buying Commission (owner, 3 Nov 2026). It opens Commission
 * Paid once the commission is Ready, or Paid Early once MD has approved it; a
 * paid one shows a filled tick.
 */
function CommissionTick({
  commission,
  canPay,
  onPay,
}: {
  commission: Commission;
  canPay: boolean;
  onPay: (early: boolean) => void;
}) {
  if (commission.payment === "PAID" || commission.payment === "PAID_EARLY") {
    return <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label={PAYMENT_LABEL[commission.payment]} />;
  }
  const payable =
    canPay && commission.payment === "NOT_PAID" && (commission.eligibility === "READY" || commission.earlyApproved);
  if (!payable) return <span className="text-muted-foreground">—</span>;
  const early = commission.eligibility !== "READY";
  return (
    <button
      type="button"
      onClick={() => onPay(early)}
      aria-label={early ? "Mark Buying Commission Paid Early" : "Mark Buying Commission Paid"}
      title={early ? "Mark Paid Early" : "Mark Paid"}
      className="mx-auto flex h-6 w-6 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:border-emerald-600 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7.5rem]">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className={`${ROLE_TD} whitespace-nowrap`}>{label}</td>
      <td className="px-2 py-2.5 text-right align-middle">{value}</td>
    </tr>
  );
}
