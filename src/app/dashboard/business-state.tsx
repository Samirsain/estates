// AC-07 — the Dashboard's business-state panel.
//
// Every figure is counted from the transaction-level records on each load
// (`businessState()` in services/report-service). Nothing here is stored or
// cached, which is the requirement: a dashboard total kept separately from the
// records would eventually disagree with them, and the disagreement is exactly
// what nobody would notice.
//
// It is a read-only summary. Each figure names where to go and look, and none
// of them is an action.

import type { BusinessState } from "@/lib/services/report-service";
import { Card } from "@/components/ui/card";

type Figure = { label: string; value: string | number; note?: string; alert?: boolean };

function Group({ title, figures }: { title: string; figures: Figure[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <dl className="space-y-1.5">
        {figures.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd
              className={`text-sm font-semibold tabular-nums ${
                f.alert && Number(f.value) > 0 ? "text-red-600" : "text-foreground"
              }`}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
      {figures.some((f) => f.note) && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          {figures.find((f) => f.note)?.note}
        </p>
      )}
    </div>
  );
}

export function BusinessStatePanel({ state }: { state: BusinessState }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Business state</h2>
        <p className="text-[11px] text-muted-foreground">
          Counted from the transaction records on this page load — approved and current state only.
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Group
          title="Customer vs Member business"
          figures={[
            { label: "Customer Bookings", value: state.business.customer },
            { label: "Member Bookings", value: state.business.member },
            {
              label: "Not yet classified",
              value: state.business.unclassified,
              note:
                "Classification is frozen at approval. A Customer who later became a Member keeps " +
                "their earlier Bookings as Customer business — that is why the split does not " +
                "follow who the buyer is today.",
            },
          ]}
        />

        <Group
          title="Transactions"
          figures={[
            { label: "Active", value: state.transactions.active },
            { label: "Completed", value: state.transactions.completed },
            { label: "Bought back / unwound", value: state.transactions.unwound },
            { label: "Cancelled / recovering", value: state.transactions.cancelled },
          ]}
        />

        <Group
          title="Royalty and cycles"
          figures={[
            { label: "Royalty earned", value: state.royalty.earned },
            { label: "Royalty pending", value: state.royalty.pending },
            { label: "of which paid", value: state.royalty.paid },
            { label: "Cycles completed", value: state.cycles.completed },
            {
              label: "Cycles in progress",
              value: state.cycles.inProgress,
              note:
                "Earned means the qualifying sale reached legal completion, not that its " +
                "payment milestone was recorded. A partial cycle is never counted as complete.",
            },
          ]}
        />

        <Group
          title="Buying Commission"
          figures={[
            { label: "Records", value: state.buying.records },
            { label: "Total percentage", value: `${state.buying.totalPercent}%` },
            {
              label: "Above the 5% cap",
              value: state.buying.overCapExceptions,
              alert: true,
              note: "The cap is refused on entry, so an exception here can only be legacy data.",
            },
          ]}
        />

        <Group
          title="Paid Early"
          figures={[
            { label: "Not Ready, no MD approval", value: state.paidEarly.notReadyUnapproved },
            { label: "Approved, not yet paid", value: state.paidEarly.approvedAwaitingPayment },
            {
              label: "Processed",
              value: state.paidEarly.processed,
              note:
                "A record that is not Ready cannot be paid at all until MD approves it, so the " +
                "first figure is the queue that approval unblocks.",
            },
          ]}
        />

        <Group
          title="Exceptions"
          figures={[
            { label: "Commission Conflict — above 4%", value: state.conflicts.aboveCap, alert: true },
            { label: "Refund pending", value: state.recoveries.refundPending },
            { label: "Cancellations decided", value: state.recoveries.cancellationsDecided },
          ]}
        />

        <Group
          title="Conversions"
          figures={[
            {
              label: "Customer Bookings held by Members",
              value: state.conversions.customersActivatedAsMembers,
              note:
                "Approved as Customer business by someone who has since been activated as a " +
                "Member. The classification stands; only the person's profile moved on.",
            },
          ]}
        />

        <Group
          title="Reconciliation"
          figures={[
            { label: "Enquiries", value: state.volumes.enquiries },
            { label: "Holds", value: state.volumes.holds },
            { label: "Approved Bookings", value: state.volumes.approvedBookings },
            {
              label: "Confirmed payment entries",
              value: state.volumes.paymentsReceived,
              note:
                "Approved Bookings is the sum of the Customer, Member and unclassified counts " +
                "above, so the split can be reconciled against the total without a second query.",
            },
          ]}
        />

        <Group
          title="Audit"
          figures={[
            { label: "Qualifying transactions in cycles", value: state.cycles.qualifyingTransactions },
            { label: "Reversal / adjustment events", value: state.audit.reversals },
            {
              label: "Superseded commission records",
              value: state.audit.supersededRecords,
              note: "Nothing is deleted. A superseded record keeps its figures and its reason.",
            },
          ]}
        />
      </div>
    </Card>
  );
}
