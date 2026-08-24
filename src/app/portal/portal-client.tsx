"use client";

// Member portal UI — DESIGN.md §3.2, §13.
// Apple Parchment Light Theme — High-End Clean Minimalist Aesthetics.

import React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
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
  "h-10 w-full rounded-xl border border-slate-200 bg-[#fafafc] px-3 text-sm text-[#1d1d1f] placeholder:text-[#7a7a7a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066cc]";

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
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header Container — Clean Parchment Card */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0066cc] text-white shadow-md shadow-[#0066cc]/20">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[#1d1d1f]">Member Portal</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#0066cc] border border-blue-100">
                  <UserCheck className="h-3 w-3" /> Member
                </span>
              </div>
              <p className="text-xs text-[#7a7a7a]">
                {data.name} · <span className="font-mono font-medium text-[#1d1d1f]">{data.memberId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setAddingEnquiry(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#0066cc] px-4 py-2 text-xs font-medium text-white shadow-md shadow-[#0066cc]/20 transition-all hover:bg-[#0071e3] active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Enquiry</span>
            </button>

            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-[#fafafc] text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#1d1d1f]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </header>
      </div>

      {/* Pill Navigation Bar */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              tab === t
                ? "bg-[#0066cc] text-white shadow-md shadow-[#0066cc]/20"
                : "text-slate-600 hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
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
            <div className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center text-xs text-[#7a7a7a] shadow-sm">
              No Plots are currently Available.
            </div>
          ) : (
            data.plots.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#1d1d1f]">{p.project}</p>
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-[#0066cc]">
                        {p.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#7a7a7a]">{p.areaSqYd} sq yd · Available</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => setRequesting(p)}
                    className="flex items-center gap-1 rounded-full border border-[#0066cc] bg-white px-4 py-1.5 text-xs font-semibold text-[#0066cc] transition-all hover:bg-[#0066cc] hover:text-white disabled:opacity-50"
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
            <div className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center text-xs text-[#7a7a7a] shadow-sm">
              You have not submitted a Hold Request yet.
            </div>
          ) : (
            data.holdRequests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200/80 bg-white p-4.5 space-y-2 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-[#1d1d1f]">
                      {r.project} · <span className="font-mono text-[#0066cc]">{r.plot}</span>
                    </p>
                    <p className="text-xs text-[#7a7a7a]">
                      Buyer: <span className="font-medium text-[#1d1d1f]">{r.buyer}</span> · Submitted {formatIst(r.createdAt)}
                    </p>
                    <p className="text-xs text-[#7a7a7a]">
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
                            : "bg-slate-100 text-slate-600 border border-slate-200"
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
                        className="border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
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
            <div className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center text-xs text-[#7a7a7a] shadow-sm">
              You have not submitted an Enquiry yet. Use Add Enquiry above.
            </div>
          ) : (
            data.enquiries.map((e) => (
              <div key={e.enquiryNo} className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-[#1d1d1f]">
                    <span className="font-mono text-[#0066cc]">{e.enquiryNo}</span> · {e.buyer}
                  </p>
                  <p className="mt-0.5 text-xs text-[#7a7a7a]">
                    {e.mobileMasked} · {e.project} · {e.plot} · Submitted {formatIst(e.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                  {humanise(e.status)}
                </span>
              </div>
            ))
          )}
        </section>
      )}

      {/* Network Section */}
      {tab === "Network" && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50 space-y-5 text-xs">
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

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-[#0066cc]">
              <Users className="h-3 w-3" /> Members you invited
            </h3>
            {data.invitedMembers.length === 0 ? (
              <p className="text-[#7a7a7a]">You have not invited any Member yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-[#7a7a7a] border-b border-slate-100">
                    <tr>
                      <th className="pb-2">Member</th>
                      <th className="pb-2 text-right">Position</th>
                      <th className="pb-2 text-right">Band</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.invitedMembers.map((m) => (
                      <tr key={m.memberId}>
                        <td className="py-2.5">
                          <span className="font-semibold text-[#1d1d1f]">{m.name}</span>
                          <span className="block font-mono text-[11px] text-[#7a7a7a]">{m.memberId}</span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-700">{m.position ?? "—"}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-[#0066cc]">
                          {m.ratePercent ? `${m.ratePercent}%` : "—"}
                        </td>
                        <td className="py-2.5">
                          <span className="text-slate-800">{humanise(m.status)}</span>
                          {m.activationDate && (
                            <span className="block text-[11px] text-[#7a7a7a]">
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

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-emerald-700">
              <Layers className="h-3 w-3" /> Customers you introduced
            </h3>
            {data.introducedCustomers.length === 0 ? (
              <p className="text-[#7a7a7a]">You have not introduced any Customer yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[24rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-[#7a7a7a] border-b border-slate-100">
                    <tr>
                      <th className="pb-2 text-right">Position</th>
                      <th className="pb-2 text-right">Band</th>
                      <th className="pb-2 text-right">Loyalty slots used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.introducedCustomers.map((c, index) => (
                      <tr key={index}>
                        <td className="py-2.5 text-right tabular-nums text-slate-700">{c.position ?? "—"}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-[#0066cc]">
                          {c.ratePercent ? `${c.ratePercent}%` : "—"}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-700">
                          {c.loyaltySlotsConsumed} of 3
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="pt-2 text-[11px] leading-relaxed text-[#7a7a7a]">
            Introduced Customers are shown as positions and bands only. The portal never shows a
            Customer&apos;s name, Customer ID or contact details (PRD §23.1).
          </p>
        </div>
      )}

      {/* Profile Section */}
      {tab === "Profile" && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50 space-y-4 text-xs">
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

          <p className="pt-1 text-[11px] leading-relaxed text-[#7a7a7a]">
            The portal never shows buyer identity, Aadhaar, PAN, bank details or internal Accounts
            remarks.
          </p>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-[#0066cc]">
              <ShieldCheck className="h-3 w-3" /> Commission Breakdown
            </h3>
            {data.commissions.length === 0 ? (
              <p className="text-[#7a7a7a]">No commission has been generated for you yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-[#7a7a7a] border-b border-slate-100">
                    <tr>
                      <th className="pb-2">Project · Plot</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2 text-right">%</th>
                      <th className="pb-2 text-right">Milestone</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.commissions.map((c, index) => (
                      <tr key={index}>
                        <td className="py-2.5">
                          <span className="font-semibold text-[#1d1d1f]">{c.project}</span>
                          <span className="block font-mono text-[11px] font-medium text-[#0066cc]">{c.plot}</span>
                        </td>
                        <td className="py-2.5 text-slate-700">{COMMISSION_LABEL[c.type] ?? c.type}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-[#0066cc]">{c.percent}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-700">{c.milestonePercent}%</td>
                        <td className="py-2.5">
                          <span className="block font-medium text-[#1d1d1f]">
                            {ELIGIBILITY_LABEL[c.eligibility] ?? c.eligibility}
                          </span>
                          <span className="block text-[11px] text-[#7a7a7a]">
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
          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-xs space-y-1">
            <p className="font-bold text-[#0066cc]">
              {requesting.project} · {requesting.label}
            </p>
            <p className="text-slate-600 leading-relaxed">
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
              <Button type="button" variant="outline" size="sm" onClick={() => setRequesting(null)} className="border-slate-200 text-slate-700">
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="bg-[#0066cc] text-white font-medium hover:bg-[#0071e3]">
                {busy ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {addingEnquiry && (
        <Modal title="Add Enquiry" onClose={() => setAddingEnquiry(false)}>
          <p className="text-xs text-[#7a7a7a]">
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
              <Button type="button" variant="outline" size="sm" onClick={() => setAddingEnquiry(false)} className="border-slate-200 text-slate-700">
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="bg-[#0066cc] text-white font-medium hover:bg-[#0071e3]">
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
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-xs text-[#7a7a7a]">{label}</span>
      <span className="text-right text-xs font-semibold text-[#1d1d1f]">{value}</span>
    </div>
  );
}
