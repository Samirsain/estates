"use client";

// Member portal UI — DESIGN.md §3.2, §13.
// Apple Parchment Light Theme — High-End Clean Minimalist Aesthetics.

import React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  LogOut,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  experience: string | null;
  invitedBy: string | null;
  invitePosition: number | null;
  inviteRatePercent: string | null;
  /** DESIGN §3.2, §13.2 — the Member's own Network. */
  invitedMembers: Array<{
    memberId: string;
    name: string;
    position: number | null;
    ratePercent: string | null;
    status: string;
    activationDate: string | null;
  }>;
  /**
   * PRD §23.1 — positions and bands only. A Customer's name and Customer ID are
   * buyer-private and never reach the portal.
   */
  introducedCustomers: Array<{
    position: number | null;
    ratePercent: string | null;
    loyaltySlotsConsumed: number;
  }>;
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

const TABS = ["Available Plots", "Hold Requests", "Enquiries", "Network", "Profile"] as const;

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-muted px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

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
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
      {/* Header Container — Clean Parchment Card */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img src="/logo.svg" alt="" className="h-12 w-12" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">Member Portal</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary border border-primary/20">
                  <UserCheck className="h-3 w-3" /> Member
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {data.name} · <span className="font-mono font-medium text-foreground">{data.memberId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setAddingEnquiry(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-all hover:bg-ring active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Enquiry</span>
            </button>

            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </header>
      </div>

      {/* Pill Navigation Bar */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className={`rounded-2xl border p-4 ${
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <p role="status" className="flex items-start gap-2.5 text-xs font-medium">
            {notice.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{notice.text}</span>
          </p>
        </div>
      )}

      {/* Available Plots Section */}
      {tab === "Available Plots" && (
        <section className="space-y-3">
          {data.plots.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-xs text-muted-foreground">
              No Plots are currently Available.
            </div>
          ) : (
            data.plots.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-border bg-card p-4 transition-all hover:"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{p.project}</p>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        {p.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.areaSqYd} sq yd · Available</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => setRequesting(p)}
                    className="flex items-center gap-1 rounded-full border border-primary bg-card px-4 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                  >
                    <span>Request Hold</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Hold Requests Section */}
      {tab === "Hold Requests" && (
        <section className="space-y-3">
          {data.holdRequests.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-xs text-muted-foreground">
              You have not submitted a Hold Request yet.
            </div>
          ) : (
            data.holdRequests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4.5 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {r.project} · <span className="font-mono text-primary">{r.plot}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Buyer: <span className="font-medium text-foreground">{r.buyer}</span> · Submitted {formatIst(r.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.status === "PENDING"
                        ? `Expires ${formatIst(r.expiresAt)} unless CRM decides sooner.`
                        : r.decisionNote ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                        r.status === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : r.status === "PENDING"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-secondary text-muted-foreground border border-border"
                      }`}
                    >
                      {humanise(r.status)}
                    </span>
                    {r.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => run(() => withdrawHoldRequestAction(r.id, newKey()))}
                        className="border-border text-xs text-foreground hover:bg-muted"
                      >
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Enquiries Section */}
      {tab === "Enquiries" && (
        <section className="space-y-3">
          {data.enquiries.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-xs text-muted-foreground">
              You have not submitted an Enquiry yet. Use Add Enquiry above.
            </div>
          ) : (
            data.enquiries.map((e) => (
              <div key={e.enquiryNo} className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    <span className="font-mono text-primary">{e.enquiryNo}</span> · {e.buyer}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.mobileMasked} · {e.project} · {e.plot} · Submitted {formatIst(e.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-0.5 text-xs font-semibold text-foreground border border-border">
                  {humanise(e.status)}
                </span>
              </div>
            ))
          )}
        </section>
      )}

      {/* Network Section */}
      {tab === "Network" && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4 text-xs">
          <div className="space-y-2">
            <Row label="Invited By" value={data.invitedBy ?? "—"} />
            <Row
              label="Your position and band"
              value={
                data.invitePosition
                  ? `Position ${data.invitePosition} · ${data.inviteRatePercent ?? "—"}%`
                  : "Not assigned"
              }
            />
          </div>

          <div className="border-t border-border/50 pt-4 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-primary">
              <Users className="h-3 w-3" /> Members you invited
            </h3>
            {data.invitedMembers.length === 0 ? (
              <p className="text-muted-foreground">You have not invited any Member yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                    <tr>
                      <th className="pb-2">Member</th>
                      <th className="pb-2 text-right">Position</th>
                      <th className="pb-2 text-right">Band</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.invitedMembers.map((m) => (
                      <tr key={m.memberId}>
                        <td className="py-2.5">
                          <span className="font-semibold text-foreground">{m.name}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">{m.memberId}</span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{m.position ?? "—"}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-primary">
                          {m.ratePercent ? `${m.ratePercent}%` : "—"}
                        </td>
                        <td className="py-2.5">
                          <span className="text-foreground">{humanise(m.status)}</span>
                          {m.activationDate && (
                            <span className="block text-[11px] text-muted-foreground">
                              {formatIst(m.activationDate)}
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

          <div className="border-t border-border/50 pt-4 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-emerald-700">
              <Layers className="h-3 w-3" /> Customers you introduced
            </h3>
            {data.introducedCustomers.length === 0 ? (
              <p className="text-muted-foreground">You have not introduced any Customer yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[24rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                    <tr>
                      <th className="pb-2 text-right">Position</th>
                      <th className="pb-2 text-right">Band</th>
                      <th className="pb-2 text-right">Loyalty slots used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.introducedCustomers.map((c, index) => (
                      <tr key={index}>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{c.position ?? "—"}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-primary">
                          {c.ratePercent ? `${c.ratePercent}%` : "—"}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">
                          {c.loyaltySlotsConsumed} of 3
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
            Introduced Customers are shown as positions and bands only. The portal never shows a
            Customer&apos;s name, Customer ID or contact details (PRD §23.1).
          </p>
        </div>
      )}

      {/* Profile Section */}
      {tab === "Profile" && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4 text-xs">
          <Row label="Member ID" value={data.memberId} />
          <Row label="Name" value={data.name} />
          <Row
            label="Activation date"
            value={data.activationDate ? formatIst(data.activationDate) : "Not activated"}
          />
          <Row label="Experience" value={data.experience ?? "Not activated"} />
          <Row label="Invited By" value={data.invitedBy ?? "—"} />
          <Row
            label="Position and band"
            value={
              data.invitePosition
                ? `Position ${data.invitePosition} · ${data.inviteRatePercent ?? "—"}%`
                : "Not assigned"
            }
          />

          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            The portal never shows buyer identity, Aadhaar, PAN, bank details or internal Accounts
            remarks.
          </p>

          <div className="border-t border-border/50 pt-4 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-primary">
              <ShieldCheck className="h-3 w-3" /> Commission Breakdown
            </h3>
            {data.commissions.length === 0 ? (
              <p className="text-muted-foreground">No commission has been generated for you yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                    <tr>
                      <th className="pb-2">Project · Plot</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2 text-right">%</th>
                      <th className="pb-2 text-right">Milestone</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.commissions.map((c, index) => (
                      <tr key={index}>
                        <td className="py-2.5">
                          <span className="font-semibold text-foreground">{c.project}</span>
                          <span className="block font-mono text-[11px] font-medium text-primary">{c.plot}</span>
                        </td>
                        <td className="py-2.5 text-foreground">{COMMISSION_LABEL[c.type] ?? c.type}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-primary">{c.percent}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{c.milestonePercent}%</td>
                        <td className="py-2.5">
                          <span className="block font-medium text-foreground">
                            {ELIGIBILITY_LABEL[c.eligibility] ?? c.eligibility}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {PAYMENT_LABEL[c.payment] ?? c.payment}
                            {c.paidOn ? ` · ${formatIst(c.paidOn)}` : ""}
                          </span>
                          {c.holdReason && (
                            <span className="block text-[11px] font-medium text-amber-700">
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
        </div>
      )}

      {/* Modals */}
      {requesting && (
        <Modal title="Request Hold" onClose={() => setRequesting(null)}>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-1">
            <p className="font-bold text-primary">
              {requesting.project} · {requesting.label}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              A Hold Request must name the actual buyer — anonymous requests are not allowed. It
              expires at the end of the working day, or the next working day when submitted after
              the cut-off. Only one Pending request may exist for the same buyer and Plot.
            </p>
          </div>
          <form
            className="space-y-4 pt-2"
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
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRequesting(null)} className="border-border text-foreground">
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="font-medium">
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
            className="space-y-4 pt-2"
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
                <Input name="fullName" required className={inputClass} />
              </Field>
              <Field label="Mobile">
                <Input name="mobile" required inputMode="numeric" className={inputClass} />
              </Field>
              <Field label="City">
                <Input name="city" className={inputClass} />
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
              <Input name="remark" className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddingEnquiry(false)} className="border-border text-foreground">
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="font-medium">
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
    <div className="flex justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}
