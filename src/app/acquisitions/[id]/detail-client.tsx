"use client";

// A single deal, and every action it can take.
//
// The list keeps one button — Payment — because that is the one thing done
// against a row while scanning a list. Approve, Reject, Cancel, Record Buying
// Commission and Correct all need the record in front of you, so they live
// here.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Coins, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PersonLink } from "@/components/person-link";
import { formatIst, type StaffRole } from "@/lib/tasks";
import { AcquisitionDialogs } from "../acquisition-dialogs";
import type { ActionResult } from "../actions";
import {
  STATUS_LABEL,
  TYPE_LABEL,
  type AcquisitionRowView,
  type Dialog,
  type Permissions,
  type PersonView,
} from "../types";

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
    const result = await action();
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  const live = row.status === "PENDING_APPROVAL" || row.status === "APPROVED";

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-4">
        <Link
          href="/acquisitions"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Buyback / Resale
        </Link>

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
            </div>
          </div>

          {/* Every action the deal can take, on the record they are taken
              against. Payment is here too — the list button opens the same
              dialog, so neither place is the only way through. */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-4">
            {live && permissions.confirmGiven && (
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "PAY", row })}>
                <Wallet className="mr-2 h-3.5 w-3.5" /> Confirm Payment Given
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
            {live && permissions.cancel && (
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "CANCEL", row })}>
                <Ban className="mr-2 h-3.5 w-3.5" /> Cancel deal
              </Button>
            )}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Record">
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
          </Section>

          <Section title="Parties">
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Seller</span>
              <PersonLink personId={row.sellerPersonId} name={row.seller} />
            </div>
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Arranged by</span>
              <PersonLink
                personId={row.arrangedByPersonId}
                name={row.arrangedBy}
                as={row.arrangedByType === "MEMBER" ? "member" : undefined}
              />
            </div>

            <h3 className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Buying Commission
            </h3>
            {row.commission ? (
              <p className="text-xs">
                <PersonLink
                  personId={row.commission.beneficiaryPersonId}
                  name={row.commission.beneficiary}
                />{" "}
                · {row.commission.percent}% <Badge variant="outline">{row.commission.eligibility}</Badge>{" "}
                <Badge variant="outline">{row.commission.payment}</Badge>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {row.arrangedByType === "THREE_PERCENT_CLUB"
                  ? "A 3% Club deal earns no Buying Commission."
                  : "Not recorded yet."}
              </p>
            )}
          </Section>

          <Section title="Payment Given schedule">
            {row.instalments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No live schedule.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {row.instalments.map((i) => (
                  <li key={i.seq} className="flex justify-between gap-3">
                    <span>
                      Instalment {i.seq} · due {formatIst(i.dueDate)}
                    </span>
                    <span className="tabular-nums">
                      {i.received}% of {i.scheduled}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Payment Given entries">
            {row.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing confirmed yet.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {row.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {entry.percent}% · {entry.reference} · {formatIst(entry.paidOn)}
                      {entry.status === "SUPERSEDED" && (
                        <Badge variant="outline" className="ml-2">
                          Superseded
                        </Badge>
                      )}
                    </span>
                    {entry.status === "CONFIRMED" && permissions.correctGiven && live && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: "CORRECT", row, entry })}
                      >
                        Correct
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
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
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
