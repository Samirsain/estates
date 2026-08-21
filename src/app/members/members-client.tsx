"use client";

// Members — DESIGN.md §13.1, §13.2; PRD.md §13, §14.3.
// Actions are hidden by permission for clarity; the server re-checks every one.

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Eye, Plus, Share2, Copy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { formatIst, istDay, type StaffRole } from "@/lib/tasks";
import {
  activateMemberAction,
  createAndActivateMemberAction,
  decideBankDetailsAction,
  enterBankDetailsAction,
  loadBankDetails,
  loadMemberDetail,
  revealBankAccountAction,
  setCommissionHoldAction,
  setMemberStatusAction,
  updateMemberReraAction,
  type ActionResult,
  type BankDetailView,
  type MemberDetail,
} from "./actions";

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export type MemberRowView = {
  id: string;
  memberId: string;
  personId: string;
  name: string;
  mobileMasked: string;
  city: string;
  status: string;
  activationDate: string | null;
  experience: string | null;
  invitedBy: string | null;
  invitePosition: number | null;
  inviteRatePercent: string | null;
  reraStatus: string;
  reraNumber: string | null;
  reraExpiryDate: string | null;
  reraNotApplicableReason: string | null;
  commissionHold: boolean;
  commissionHoldReason: string | null;
  portalStatus: string | null;
  aadhaarStatus: string;
  panStatus: string;
  invitedCount: number;
  introducedCount: number;
};

type Permissions = {
  activate: boolean;
  deactivate: boolean;
  enterBank: boolean;
  verifyBank: boolean;
  viewFullBank: boolean;
};

const RERA_LABEL: Record<string, string> = {
  REGISTERED: "Registered",
  PENDING: "Pending",
  EXPIRED: "Expired",
  NOT_APPLICABLE: "Not Applicable",
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

type Dialog =
  | { kind: "ACTIVATE" }
  | { kind: "STATUS"; row: MemberRowView; active: boolean }
  | { kind: "HOLD"; row: MemberRowView; hold: boolean }
  | { kind: "RERA"; row: MemberRowView }
  | { kind: "BANK_ENTER"; row: MemberRowView }
  | { kind: "BANK_DECIDE"; row: MemberRowView; bankDetailId: string; label: string; approve: boolean }
  | null;

export default function MembersClient({
  role,
  actorName,
  staffAccountId,
  rows,
  activatable,
  permissions,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: MemberRowView[];
  activatable: Array<{ id: string; label: string }>;
  permissions: Permissions;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<MemberDetail | null>(null);
  const [banks, setBanks] = React.useState<BankDetailView[]>([]);

  function copyInviteText(memberId: string, name: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/login?tab=member&loginId=${memberId}`;
    const text = `🌟 Welcome to 3% Club Real Estate Partner Network!\n\nHi ${name}, your Member account (${memberId}) is active.\n\n🔗 Direct Portal Link:\n${link}\n\n🆔 Member ID: ${memberId}\n🔑 Initial Password: ChangeMe#2026\n\nClick the link above to access your portal, view inventory, request plot holds, and submit buyer leads!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setNotice({ kind: "ok", text: `Copied portal invitation link & credentials for ${memberId} (${name}) to clipboard!` });
    }
  }

  const visible = rows.filter(
    (r) =>
      (statusFilter === "ALL" || r.status === statusFilter) &&
      (search.trim() === "" ||
        `${r.memberId} ${r.name} ${r.city} ${r.reraNumber ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

  async function openDetail(row: MemberRowView) {
    if (openId === row.id) {
      setOpenId(null);
      setDetail(null);
      setBanks([]);
      return;
    }
    setOpenId(row.id);
    setDetail(null);
    setBanks([]);
    const [d, b] = await Promise.all([loadMemberDetail(row.id), loadBankDetails(row.personId)]);
    setDetail(d);
    setBanks(b);
  }

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    setNotice(
      result.ok ? { kind: "ok", text: result.message ?? "Done." } : { kind: "error", text: result.error }
    );
    if (result.ok) {
      setDialog(null);
      const row = rows.find((r) => r.id === openId);
      if (row) {
        const [d, b] = await Promise.all([loadMemberDetail(row.id), loadBankDetails(row.personId)]);
        setDetail(d);
        setBanks(b);
      }
      router.refresh();
    }
  }

  const newKey = () => globalThis.crypto.randomUUID();

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Members</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {visible.length} of {rows.length} · Network positions are fixed at activation and never
              renumbered · times in Asia/Kolkata
            </p>
          </div>
          {permissions.activate && (
            <Button size="sm" variant="gradient" onClick={() => setDialog({ kind: "ACTIVATE" })}>
              <Plus className="mr-1 h-4 w-4" /> Activate Member
            </Button>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={filterClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
          <Input
            className="h-9 w-64"
            placeholder="Search Member ID, name, city or RERA number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {notice && (
          <Card
            className={`p-4 ${
              notice.kind === "ok"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-red-500/40 bg-red-500/5"
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
              {notice.text}
            </p>
          </Card>
        )}

        <Card className="overflow-x-auto p-2">
          <table className="w-full min-w-[58rem] border-separate border-spacing-y-1 text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Mobile · City</th>
                <th className="px-3 py-2">Invited By</th>
                <th className="px-3 py-2">Position</th>
                <th className="px-3 py-2">RERA</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No Members match these filters.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className="bg-secondary align-top">
                    <td className="rounded-l-xl px-3 py-3">
                      <button
                        type="button"
                        className="text-left font-semibold hover:underline"
                        onClick={() => openDetail(row)}
                        aria-expanded={openId === row.id}
                      >
                        {row.memberId}
                      </button>
                      <span className="block text-[11px] text-muted-foreground">{row.name}</span>
                      {row.experience && (
                        <span className="block text-[11px] text-muted-foreground">
                          {row.experience} as a Member
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {row.mobileMasked}
                      <span className="block text-[11px] text-muted-foreground">{row.city}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">{row.invitedBy ?? "—"}</td>
                    <td className="px-3 py-3 text-xs tabular-nums">
                      {row.invitePosition
                        ? `${row.invitePosition} · ${row.inviteRatePercent}%`
                        : "Not assigned"}
                      <span className="block text-[11px] text-muted-foreground">
                        {row.invitedCount} invited · {row.introducedCount} introduced
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <Badge
                        variant={
                          row.reraStatus === "REGISTERED" || row.reraStatus === "NOT_APPLICABLE"
                            ? "success"
                            : "destructive"
                        }
                      >
                        {RERA_LABEL[row.reraStatus] ?? row.reraStatus}
                      </Badge>
                      {row.reraExpiryDate && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          Expires {formatIst(row.reraExpiryDate)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={row.status === "ACTIVE" ? "success" : "outline"}>
                        {row.status === "ACTIVE" ? "Active" : "Deactivated"}
                      </Badge>
                      {row.commissionHold && (
                        <span className="mt-1 block text-[11px] text-amber-300">
                          Commission Hold
                        </span>
                      )}
                      {row.portalStatus === "DISABLED" && (
                        <span className="block text-[11px] text-muted-foreground">
                          Portal disabled
                        </span>
                      )}
                    </td>
                    <td className="rounded-r-xl px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.status === "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Copy Portal Invite Link & Credentials"
                            onClick={() => copyInviteText(row.memberId, row.name)}
                          >
                            <Share2 className="mr-1 h-3.5 w-3.5" /> Invite Link
                          </Button>
                        )}
                        {permissions.deactivate && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setDialog({ kind: "STATUS", row, active: row.status !== "ACTIVE" })
                            }
                          >
                            {row.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                          </Button>
                        )}
                        {permissions.deactivate && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: "HOLD", row, hold: !row.commissionHold })}
                          >
                            {row.commissionHold ? "Remove Hold" : "Commission Hold"}
                          </Button>
                        )}
                        {permissions.activate && (
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "RERA", row })}>
                            RERA
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {openId === row.id && (
                    <tr>
                      <td colSpan={7} className="px-1 pb-3">
                        <MemberDetailPanel
                          row={row}
                          detail={detail}
                          banks={banks}
                          permissions={permissions}
                          onAction={setDialog}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {dialog?.kind === "ACTIVATE" && (
        <ActivateMemberDialogForm
          activatable={activatable}
          rows={rows}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmitExisting={(input) => run(() => activateMemberAction(input, newKey()))}
          onSubmitNew={(input) => run(() => createAndActivateMemberAction(input, newKey()))}
        />
      )}

      {dialog?.kind === "STATUS" && (
        <MemberDialog
          title={dialog.active ? "Reactivate Member" : "Deactivate Member"}
          row={dialog.row}
          consequence={
            dialog.active
              ? "Portal access is restored, the Member may act again, and unpaid commission eligibility is rechecked rather than assumed. Network positions are unchanged."
              : "Portal access stops immediately, no new Member Enquiries, Hold Requests or Member-linked Booking Requests may be created, and every unpaid commission goes On Hold — Member Deactivated. Paid and Paid Early records stay historical, and Network positions stay exactly as they are."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              setMemberStatusAction(dialog.row.id, dialog.active, String(f.get("reason")), newKey())
            )
          }
        />
      )}

      {dialog?.kind === "HOLD" && (
        <MemberDialog
          title={dialog.hold ? "Apply Commission Hold" : "Remove Commission Hold"}
          row={dialog.row}
          consequence={
            dialog.hold
              ? "Every unpaid commission record for this Member goes On Hold. Paid and Paid Early history is untouched."
              : "Affected records are reassessed and the same Accounts task resumes rather than a duplicate being created."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              setCommissionHoldAction(dialog.row.id, dialog.hold, String(f.get("reason")), newKey())
            )
          }
        />
      )}

      {dialog?.kind === "RERA" && (
        <Modal
          title={`RERA — ${dialog.row.memberId}`}
          description="Registered or Not Applicable satisfies the commission condition. Pending and Expired hold it."
          onClose={() => setDialog(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                updateMemberReraAction(
                  {
                    memberProfileId: dialog.row.id,
                    status: String(f.get("reraStatus")) as "PENDING",
                    reraNumber: String(f.get("reraNumber") ?? ""),
                    expiryDate: String(f.get("reraExpiryDate") ?? ""),
                    notApplicableReason: String(f.get("reraNotApplicableReason") ?? ""),
                  },
                  newKey()
                )
              );
            }}
          >
            <ReraFields row={dialog.row} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Processing…" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === "BANK_ENTER" && (
        <Modal
          title={`Bank Details — ${dialog.row.memberId}`}
          description="CRM enters, Accounts verifies. Any existing verified account stays active until this replacement is approved."
          onClose={() => setDialog(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                enterBankDetailsAction(
                  {
                    personId: dialog.row.personId,
                    accountHolder: String(f.get("accountHolder")),
                    bankName: String(f.get("bankName")),
                    accountNumber: String(f.get("accountNumber")),
                    ifsc: String(f.get("ifsc")),
                  },
                  newKey()
                )
              );
            }}
          >
            <Field label="Account Holder">
              <Input name="accountHolder" required />
            </Field>
            <Field label="Bank Name">
              <Input name="bankName" required />
            </Field>
            <Field label="Account Number">
              <Input name="accountNumber" required inputMode="numeric" />
            </Field>
            <Field label="IFSC">
              <Input name="ifsc" required placeholder="HDFC0001234" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Processing…" : "Submit for verification"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === "BANK_DECIDE" && (
        <MemberDialog
          title={dialog.approve ? "Verify Bank Details" : "Reject Bank Details"}
          row={dialog.row}
          consequence={
            dialog.approve
              ? `${dialog.label} becomes the active account. The previously verified account is kept as History, never deleted. Bank entry and verification must be different staff accounts.`
              : `${dialog.label} is rejected. The previously verified account is unchanged.`
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              decideBankDetailsAction(
                dialog.bankDetailId,
                dialog.approve,
                String(f.get("reason")),
                newKey()
              )
            )
          }
        />
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------ detail panel */

function MemberDetailPanel({
  row,
  detail,
  banks,
  permissions,
  onAction,
}: {
  row: MemberRowView;
  detail: MemberDetail | null;
  banks: BankDetailView[];
  permissions: Permissions;
  onAction: (d: Dialog) => void;
}) {
  const [tab, setTab] = React.useState<"NETWORK" | "COMMISSION" | "BANK">("NETWORK");
  const [revealed, setRevealed] = React.useState<Record<string, string>>({});

  if (!detail || detail.id !== row.id) {
    return <Card className="p-6 text-xs text-muted-foreground">Loading Member details…</Card>;
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap gap-2">
        {(["NETWORK", "COMMISSION", "BANK"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1 text-xs ${
              tab === t ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {tab === "NETWORK" && (
        <div className="space-y-4 text-xs">
          <p className="text-muted-foreground">
            Activated {row.activationDate ? formatIst(row.activationDate) : "—"}
            {row.experience ? ` · ${row.experience} as a Member` : ""}. Positions are
            assigned once and never renumbered; at each anniversary only newly introduced Members or
            Customers enter the new annual counter.
          </p>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Invited Members — annual Invited Member Counter
            </h3>
            {detail.invitedMembers.length === 0 ? (
              <p className="mt-2 text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {detail.invitedMembers.map((m) => (
                  <li key={m.memberId} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {m.memberId} · {m.name}
                      {m.status !== "ACTIVE" && (
                        <span className="ml-2 text-[11px] text-muted-foreground">Deactivated</span>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      Position {m.position} · {m.ratePercent}%
                      {m.yearStart ? ` · year from ${formatIst(m.yearStart)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Introduced Customers — separate annual Introduced Customer Counter
            </h3>
            {detail.introducedCustomers.length === 0 ? (
              <p className="mt-2 text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {detail.introducedCustomers.map((c) => (
                  <li key={c.customerId} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {c.customerId} · {c.name}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {c.loyaltySlotsConsumed}/3 Loyalty slots used
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      Position {c.position} · {c.ratePercent}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "COMMISSION" && (
        <div className="space-y-2">
          {detail.commissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No commission generated for this Member yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1">Booking</th>
                    <th className="py-1">Project · Plot</th>
                    <th className="py-1">Type</th>
                    <th className="py-1 text-right">%</th>
                    <th className="py-1">Eligibility</th>
                    <th className="py-1">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.commissions.map((c) => (
                    <tr key={c.id} className={c.isCurrent ? "" : "text-muted-foreground"}>
                      <td className="py-1">
                        {c.bookingNumber}
                        {!c.isCurrent && (
                          <span className="ml-2 rounded border border-border/60 px-1 text-[10px]">
                            Superseded
                          </span>
                        )}
                      </td>
                      <td className="py-1">
                        {c.project}
                        <span className="block text-[11px] text-muted-foreground">{c.plot}</span>
                      </td>
                      <td className="py-1">{c.type}</td>
                      <td className="py-1 text-right tabular-nums">{c.percent}</td>
                      <td className="py-1">
                        {ELIGIBILITY_LABEL[c.eligibility] ?? c.eligibility}
                        {c.holdReason && (
                          <span className="block text-[11px] text-amber-300">
                            {c.holdReason.replaceAll("_", " ").toLowerCase()}
                          </span>
                        )}
                      </td>
                      <td className="py-1">{PAYMENT_LABEL[c.payment] ?? c.payment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "BANK" && (
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            Commission eligibility requires a currently Verified bank. A pending replacement never
            puts a Ready commission on hold by itself.
          </p>
          {banks.length === 0 ? (
            <p className="text-muted-foreground">No bank details recorded.</p>
          ) : (
            <ul className="space-y-2">
              {banks.map((b) => (
                <li key={b.id} className="rounded-xl border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {b.accountHolder} · {b.bankName}
                      <span className="block text-[11px] text-muted-foreground">
                        {revealed[b.id] ? revealed[b.id] : `Account ending ${b.accountLastFour}`} ·{" "}
                        {b.ifsc}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge
                        variant={
                          b.status === "VERIFIED"
                            ? "success"
                            : b.status === "PENDING"
                              ? "warning"
                              : "outline"
                        }
                      >
                        {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                      </Badge>
                      {permissions.viewFullBank && !revealed[b.id] && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const result = await revealBankAccountAction(b.id);
                            if (result.ok) {
                              setRevealed((prev) => ({ ...prev, [b.id]: result.accountNumber }));
                            }
                          }}
                        >
                          <Eye className="mr-1 h-3 w-3" /> Reveal
                        </Button>
                      )}
                      {b.status === "PENDING" && permissions.verifyBank && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onAction({
                                kind: "BANK_DECIDE",
                                row,
                                bankDetailId: b.id,
                                label: `${b.bankName} ending ${b.accountLastFour}`,
                                approve: true,
                              })
                            }
                          >
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              onAction({
                                kind: "BANK_DECIDE",
                                row,
                                bankDetailId: b.id,
                                label: `${b.bankName} ending ${b.accountLastFour}`,
                                approve: false,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Entered by {b.enteredByRef} on {formatIst(b.createdAt)}
                    {b.verifiedByRef ? ` · verified by ${b.verifiedByRef}` : ""}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {permissions.enterBank && (
            <Button size="sm" variant="outline" onClick={() => onAction({ kind: "BANK_ENTER", row })}>
              Enter new bank details
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- dialogs */

/** DESIGN §5.1 — record identifier, exact action, consequences, compulsory reason. */
function MemberDialog({
  title,
  row,
  consequence,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  row: MemberRowView;
  consequence: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.memberId} · {row.name}
        </p>
        <p className="mt-1 text-muted-foreground">{consequence}</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        <Field label="Reason — compulsory">
          <Input name="reason" required minLength={3} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Processing…" : "Confirm"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The RERA block, shared by activation and the standalone update. */
function ReraFields({ row }: { row?: MemberRowView }) {
  const [status, setStatus] = React.useState(row?.reraStatus ?? "PENDING");

  return (
    <>
      <Field label="RERA status">
        <select
          name="reraStatus"
          className={inputClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="PENDING">Pending</option>
          <option value="REGISTERED">Registered</option>
          <option value="EXPIRED">Expired</option>
          <option value="NOT_APPLICABLE">Not Applicable</option>
        </select>
      </Field>
      {status === "REGISTERED" && (
        <>
          <Field label="Registration Number">
            <Input name="reraNumber" required defaultValue={row?.reraNumber ?? ""} />
          </Field>
          <Field label="Expiry Date — a reminder task opens seven days before">
            <Input
              name="reraExpiryDate"
              type="date"
              min={istDay(new Date())}
              defaultValue={row?.reraExpiryDate?.slice(0, 10) ?? ""}
            />
          </Field>
        </>
      )}
      {status === "NOT_APPLICABLE" && (
        <Field label="Not Applicable reason — compulsory">
          <Input
            name="reraNotApplicableReason"
            required
            minLength={3}
            defaultValue={row?.reraNotApplicableReason ?? ""}
          />
        </Field>
      )}
    </>
  );
}

function ActivateMemberDialogForm({
  activatable,
  rows,
  busy,
  onClose,
  onSubmitExisting,
  onSubmitNew,
}: {
  activatable: Array<{ id: string; label: string }>;
  rows: MemberRowView[];
  busy: boolean;
  onClose: () => void;
  onSubmitExisting: (input: Parameters<typeof activateMemberAction>[0]) => void;
  onSubmitNew: (input: Parameters<typeof createAndActivateMemberAction>[0]) => void;
}) {
  const [personMode, setPersonMode] = React.useState<"existing" | "new">(
    activatable.length > 0 ? "existing" : "new"
  );

  return (
    <Modal
      title="Activate Member"
      description="Activation is recorded now and cannot be backdated. The Member ID and Network position become active immediately."
      onClose={onClose}
    >
      <div className="flex gap-2 pb-2">
        <button
          type="button"
          onClick={() => setPersonMode("existing")}
          className={`flex-1 rounded-xl border py-2 text-center text-xs font-semibold ${
            personMode === "existing"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground"
          }`}
        >
          Select Existing Person ({activatable.length})
        </button>
        <button
          type="button"
          onClick={() => setPersonMode("new")}
          className={`flex-1 rounded-xl border py-2 text-center text-xs font-semibold ${
            personMode === "new"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground"
          }`}
        >
          + Create New Person
        </button>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (personMode === "existing") {
            onSubmitExisting({
              personId: String(f.get("personId")),
              invitedByMemberId: String(f.get("invitedByMemberId") ?? ""),
              reraStatus: String(f.get("reraStatus")) as "PENDING",
              reraNumber: String(f.get("reraNumber") ?? ""),
              reraExpiryDate: String(f.get("reraExpiryDate") ?? ""),
              reraNotApplicableReason: String(f.get("reraNotApplicableReason") ?? ""),
            });
          } else {
            onSubmitNew({
              fullName: String(f.get("fullName")),
              mobile: String(f.get("mobile")),
              city: String(f.get("city") ?? ""),
              invitedByMemberId: String(f.get("invitedByMemberId") ?? ""),
              reraStatus: String(f.get("reraStatus")) as "PENDING",
              reraNumber: String(f.get("reraNumber") ?? ""),
              reraExpiryDate: String(f.get("reraExpiryDate") ?? ""),
              reraNotApplicableReason: String(f.get("reraNotApplicableReason") ?? ""),
            });
          }
        }}
      >
        {personMode === "existing" ? (
          <Field label="Person">
            <select name="personId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select a Person
              </option>
              {activatable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <Field label="Full Name">
              <Input name="fullName" required placeholder="e.g. Samir Sain" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary Mobile">
                <Input name="mobile" required placeholder="9876543210" inputMode="tel" />
              </Field>
              <Field label="City (optional)">
                <Input name="city" placeholder="Jaipur" />
              </Field>
            </div>
          </div>
        )}

        <Field label="Invited By — position and rate band are taken under this Member">
          <select name="invitedByMemberId" className={inputClass} defaultValue="">
            <option value="">No inviting Member (Root Member)</option>
            {rows
              .filter((r) => r.status === "ACTIVE")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.memberId} · {r.name}
                </option>
              ))}
          </select>
        </Field>
        <ReraFields />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Processing…" : "Confirm activation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
