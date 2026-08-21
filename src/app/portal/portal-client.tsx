"use client";

// Member portal UI — DESIGN.md §3.2, §13.

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { formatIst } from "@/lib/tasks";
import { signOut } from "@/app/login/actions";
import {
  addMemberEnquiryAction,
  submitHoldRequestAction,
  withdrawHoldRequestAction,
  type ActionResult,
} from "./actions";

/** PRD §23.1 — the only commission wording a Member ever sees. */
const COMMISSION_LABEL: Record<string, string> = {
  DIRECT: "Direct Commission",
  INVITE: "Invite Commission",
  ROYALTY: "Royalty",
  LOYALTY: "Loyalty Bonus",
  BUYING: "Buying Commission",
};

const ELIGIBILITY_LABEL: Record<string, string> = {
  MILESTONE_PENDING: "Milestone Pending",
  READY: "Ready",
  ON_HOLD: "On Hold",
};

const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Accounts Adjustment Required",
  CANCELLED: "Cancelled",
};

/** Member-safe hold wording. Internal Accounts remarks are never shown. */
const HOLD_LABEL: Record<string, string> = {
  AADHAAR_PENDING: "Aadhaar Pending",
  BANK_VERIFICATION_PENDING: "Bank Verification Pending",
  RERA_PENDING: "RERA Pending",
  RERA_EXPIRED: "RERA Expired",
  MEMBER_COMMISSION_HOLD: "On Hold",
  MEMBER_DEACTIVATED: "Member Deactivated",
  REFUND_PENDING: "Deal Under Review",
  CHANGE_PLOT_PENDING: "Deal Under Review",
  BUYBACK_PENDING: "Deal Under Review",
  PAYMENT_PENDING: "Payment Pending",
  COMMISSION_CONFLICT_ABOVE_4: "Under Review",
};

export type PortalData = {
  memberId: string;
  name: string;
  activationDate: string | null;
  invitedBy: string | null;
  invitePosition: number | null;
  inviteRatePercent: string | null;
  projects: Array<{ id: string; name: string }>;
  plots: Array<{ id: string; projectId: string; project: string; label: string; areaSqYd: string }>;
  buyers: Array<{ id: string; label: string }>;
  enquiries: Array<{
    enquiryNo: string;
    buyer: string;
    mobileMasked: string;
    project: string;
    plot: string;
    status: string;
    createdAt: string;
  }>;
  holdRequests: Array<{
    id: string;
    project: string;
    plot: string;
    buyer: string;
    status: string;
    createdAt: string;
    expiresAt: string;
    decisionNote: string | null;
  }>;
  /** PRD §23.1 — Project, Plot, type, percentage, milestone and status only. */
  commissions: Array<{
    project: string;
    plot: string;
    type: string;
    percent: string;
    milestonePercent: string;
    eligibility: string;
    holdReason: string | null;
    payment: string;
    paidOn: string | null;
  }>;
};

const TABS = ["Available Plots", "Hold Requests", "Enquiries", "Profile"] as const;

const inputClass =
  "h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const humanise = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

export default function PortalClient({ data }: { data: PortalData }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Available Plots");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [requesting, setRequesting] = React.useState<PortalData["plots"][number] | null>(null);
  const [addingEnquiry, setAddingEnquiry] = React.useState(false);

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    setNotice(result.ok ? { kind: "ok", text: result.message ?? "Done." } : { kind: "error", text: result.error });
    if (result.ok) router.refresh();
    return result.ok;
  }

  const newKey = () => globalThis.crypto.randomUUID();

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Member portal</h1>
            <p className="text-xs text-muted-foreground">
              {data.name} · {data.memberId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="gradient" onClick={() => setAddingEnquiry(true)}>
            Add Enquiry
          </Button>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-xl border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              tab === t
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:bg-accent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {notice && (
        <Card
          className={`p-4 ${
            notice.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
          }`}
        >
          <p
            role="status"
            className={`flex items-start gap-2 text-sm ${
              notice.kind === "ok" ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {notice.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </p>
        </Card>
      )}

      {tab === "Available Plots" && (
        <section className="space-y-3">
          {data.plots.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No Plots are currently Available.
            </Card>
          ) : (
            data.plots.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {p.project} · <span className="font-mono text-primary">{p.label}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{p.areaSqYd} sq yd · Available</p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => setRequesting(p)}>
                  Request Hold
                </Button>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === "Hold Requests" && (
        <section className="space-y-3">
          {data.holdRequests.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              You have not submitted a Hold Request yet.
            </Card>
          ) : (
            data.holdRequests.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">
                    {r.project} · <span className="font-mono text-primary">{r.plot}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    For {r.buyer} · submitted {formatIst(r.createdAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.status === "PENDING"
                      ? `Expires ${formatIst(r.expiresAt)} unless CRM decides sooner.`
                      : r.decisionNote ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      r.status === "APPROVED" ? "success" : r.status === "PENDING" ? "info" : "outline"
                    }
                  >
                    {humanise(r.status)}
                  </Badge>
                  {r.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => run(() => withdrawHoldRequestAction(r.id, newKey()))}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === "Enquiries" && (
        <section className="space-y-3">
          {data.enquiries.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              You have not submitted an Enquiry yet. Use Add Enquiry above.
            </Card>
          ) : (
            data.enquiries.map((e) => (
              <Card key={e.enquiryNo} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">
                    <span className="font-mono text-primary">{e.enquiryNo}</span> · {e.buyer}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.mobileMasked} · {e.project} · {e.plot} · submitted {formatIst(e.createdAt)}
                  </p>
                </div>
                <Badge variant={e.status === "ACTIVE" ? "info" : "outline"}>{humanise(e.status)}</Badge>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === "Profile" && (
        <Card className="space-y-2 p-5 text-sm">
          <Row label="Member ID" value={data.memberId} />
          <Row label="Name" value={data.name} />
          <Row
            label="Activation date"
            value={data.activationDate ? formatIst(data.activationDate) : "Not activated"}
          />
          <Row label="Invited By" value={data.invitedBy ?? "—"} />
          <Row
            label="Position and band"
            value={
              data.invitePosition
                ? `Position ${data.invitePosition} · ${data.inviteRatePercent ?? "—"}%`
                : "Not assigned"
            }
          />
          <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
            The portal never shows buyer identity, Aadhaar, PAN, bank details or internal Accounts
            remarks.
          </p>

          <div className="mt-4 border-t border-border/50 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Commission
            </h3>
            {data.commissions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No commission has been generated for you yet.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1">Project · Plot</th>
                      <th className="py-1">Type</th>
                      <th className="py-1 text-right">%</th>
                      <th className="py-1 text-right">Milestone</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.commissions.map((c, index) => (
                      <tr key={index}>
                        <td className="py-1">
                          {c.project}
                          <span className="block text-[11px] text-muted-foreground">{c.plot}</span>
                        </td>
                        <td className="py-1">{COMMISSION_LABEL[c.type] ?? c.type}</td>
                        <td className="py-1 text-right tabular-nums">{c.percent}</td>
                        <td className="py-1 text-right tabular-nums">{c.milestonePercent}%</td>
                        <td className="py-1">
                          <span className="block">{ELIGIBILITY_LABEL[c.eligibility] ?? c.eligibility}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {PAYMENT_LABEL[c.payment] ?? c.payment}
                            {c.paidOn ? ` · ${formatIst(c.paidOn)}` : ""}
                          </span>
                          {c.holdReason && (
                            <span className="block text-[11px] text-amber-300">
                              {HOLD_LABEL[c.holdReason] ?? c.holdReason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {requesting && (
        <Modal title="Request Hold" onClose={() => setRequesting(null)}>
          <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
            <p className="font-semibold text-foreground">
              {requesting.project} · {requesting.label}
            </p>
            <p className="mt-1 text-muted-foreground">
              A Hold Request must name the actual buyer — anonymous requests are not allowed. It
              expires at the end of the working day, or the next working day when submitted after
              the cut-off. Only one Pending request may exist for the same buyer and Plot, and the
              buyer may hold at most three open Plot positions.
            </p>
          </div>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const personId = String(new FormData(e.currentTarget).get("personId"));
              const done = await run(() => submitHoldRequestAction(requesting.id, personId, newKey()));
              if (done) setRequesting(null);
            }}
          >
            <Field label="Buyer — required">
              <select name="personId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Select yourself or a buyer you introduced
                </option>
                {data.buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRequesting(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {addingEnquiry && (
        <Modal title="Add Enquiry" onClose={() => setAddingEnquiry(false)}>
          <p className="text-xs text-muted-foreground">
            The Source is recorded as By Member automatically and the Enquiry is assigned to CRM.
          </p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const done = await run(() =>
                addMemberEnquiryAction(
                  {
                    fullName: String(f.get("fullName")),
                    mobile: String(f.get("mobile")),
                    city: String(f.get("city") ?? ""),
                    projectId: String(f.get("projectId")),
                    plotId: String(f.get("plotId") ?? ""),
                    remark: String(f.get("remark") ?? ""),
                  },
                  newKey()
                )
              );
              if (done) setAddingEnquiry(false);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Buyer name">
                <Input name="fullName" required />
              </Field>
              <Field label="Mobile">
                <Input name="mobile" required inputMode="numeric" />
              </Field>
              <Field label="City">
                <Input name="city" />
              </Field>
              <Field label="Interested Project">
                <select name="projectId" required defaultValue="" className={inputClass}>
                  <option value="" disabled>
                    Select a Project
                  </option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Interested Plot (optional)">
              <select name="plotId" defaultValue="" className={inputClass}>
                <option value="">General Enquiry</option>
                {data.plots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project} · {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Remark (optional)">
              <Input name="remark" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddingEnquiry(false)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Submitting…" : "Submit Enquiry"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}


