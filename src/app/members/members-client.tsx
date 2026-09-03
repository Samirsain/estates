"use client";

// Members — DESIGN.md §13.1, §13.2; PRD.md §13, §14.3.
// Actions are hidden by permission for clarity; the server re-checks every one.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Eye, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { formatIst, istDay, type StaffRole, formatIstDate } from "@/lib/tasks";
import {
  activateMemberAction,
  createAndActivateMemberAction,
  decideBankDetailsAction,
  enterBankDetailsAction,
  loadBankDetails,
  loadMemberDetail,
  revealBankAccountAction,
  type ActionResult,
  type BankDetailView,
  type MemberDetail,
} from "./actions";
import { PersonPicker } from "@/components/person-picker";

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export type MemberRowView = {
  id: string;
  memberId: string;
  personId: string;
  name: string;
  mobile: string;
  city: string;
  status: string;
  activationDate: string | null;
  experience: string | null;
  invitedBy: { id: string; memberId: string; name: string } | null;
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
  /** Bookings this Member sold that became a sale — see the members loader. */
  dealCount: number;
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
      <div className="mx-auto max-w-6xl space-y-4">
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

        {/* Same table as Plots, Customers and Enquiries: a rule between rows,
            no block of colour behind each one, and every column wide enough for
            what it holds so nothing wraps to a third line. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] border-collapse text-xs">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                {/* One fact per column. Position and Member since moved into
                    the Member's own panel — they are read when a Member is
                    being looked at, not scanned down a list — and what the list
                    is scanned for took their place. */}
                <th className="w-[7rem] px-3 py-1.5">Member ID</th>
                <th className="w-[11rem] px-3 py-1.5">Name</th>
                <th className="w-[8rem] px-3 py-1.5">Mobile</th>
                <th className="w-[8rem] px-3 py-1.5">City</th>
                <th className="w-[11rem] px-3 py-1.5">Invited by</th>
                <th className="w-[6rem] px-3 py-1.5 text-center">Total Deals</th>
                <th className="w-[10rem] px-3 py-1.5">RERA</th>
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
                  <tr
                    className={`h-14 border-b border-border/60 align-middle leading-tight last:border-0 [&>td]:px-3 [&>td]:py-1 ${
                      row.status === "ACTIVE"
                        ? "hover:bg-secondary/50"
                        : "bg-red-500/5 text-red-700 hover:bg-red-500/10"
                    }`}
                    title={row.status === "ACTIVE" ? undefined : "Deactivated"}
                  >
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        className="font-bold text-primary hover:underline"
                        onClick={() => router.push(`/members/${row.id}`)}
                        aria-label={`View details for ${row.memberId}`}
                      >
                        {row.memberId}
                      </button>
                    </td>
                    <td>
                      <Link href={`/members/${row.id}`} className="hover:underline">
                        {row.name}
                      </Link>
                      {/* These qualify the Member, not the name — they stay
                          under it because that is who they are about. */}
                      {row.commissionHold && (
                        <span className="block text-[11px] text-amber-800">Commission Hold</span>
                      )}
                      {row.portalStatus === "DISABLED" && (
                        <span className="block text-[11px] text-muted-foreground">
                          Portal disabled
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{row.mobile}</td>
                    <td className="whitespace-nowrap">{row.city}</td>
                    <td>
                      {row.invitedBy ? (
                        <Link href={`/members/${row.invitedBy.id}`} className="group">
                          <span className="block font-semibold text-primary group-hover:underline">
                            {row.invitedBy.memberId}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {row.invitedBy.name}
                          </span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-center tabular-nums">
                      {row.dealCount > 0 ? (
                        <span className="font-semibold text-foreground">{row.dealCount}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <Badge
                        variant={
                          row.reraStatus === "REGISTERED" || row.reraStatus === "NOT_APPLICABLE"
                            ? "success"
                            : "destructive"
                        }
                        className="whitespace-nowrap"
                      >
                        {RERA_LABEL[row.reraStatus] ?? row.reraStatus}
                      </Badge>
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
        </div>
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
                    branchName: String(f.get("branchName") ?? ""),
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bank Name">
                <Input name="bankName" required />
              </Field>
              <Field label="Branch Name">
                <Input name="branchName" required />
              </Field>
              <Field label="Account Number">
                <Input name="accountNumber" required inputMode="numeric" />
              </Field>
              <Field label="IFSC">
                <Input name="ifsc" required placeholder="HDFC0001234" />
              </Field>
            </div>
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
  const [revealing, setRevealing] = React.useState<string | null>(null);
  const [revealError, setRevealError] = React.useState<string | null>(null);

  if (!detail || detail.id !== row.id) {
    return <Card className="p-4 text-xs text-muted-foreground">Loading Member details…</Card>;
  }

  return (
    <Card className="space-y-4 p-4">
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
                      <Link href={`/members/${m.id}`} className="text-primary hover:underline">
                        {m.memberId} · {m.name}
                      </Link>
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
              Royalty Linked Customers — the Member was Sold By on their first purchase
            </h3>
            {detail.royaltyLinkedCustomers.length === 0 ? (
              <p className="mt-2 text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {detail.royaltyLinkedCustomers.map((c) => (
                  <li key={c.customerId} className="flex flex-wrap justify-between gap-2">
                    <span>
                      <Link href={`/customers/${c.id}`} className="text-primary hover:underline">
                        {c.customerId} · {c.name}
                      </Link>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {c.loyaltySlotsConsumed}/3 Loyalty slots used
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.position === null
                        ? "Provisional — no position until the first purchase completes"
                        : `Position ${c.position} · ${c.ratePercent}%`}
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
                          <span className="block text-[11px] text-amber-800">
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
          {revealError && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
              {revealError}
            </p>
          )}
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
                          disabled={revealing === b.id}
                          onClick={async () => {
                            // A refused reveal used to do nothing at all: the
                            // button moved and the account number never came,
                            // which reads as a broken screen rather than a
                            // permission answer.
                            if (revealing) return;
                            setRevealing(b.id);
                            setRevealError(null);
                            try {
                              const result = await revealBankAccountAction(b.id);
                              if (result.ok) {
                                setRevealed((prev) => ({ ...prev, [b.id]: result.accountNumber }));
                              } else {
                                setRevealError(result.error);
                              }
                            } finally {
                              setRevealing(null);
                            }
                          }}
                        >
                          <Eye className="mr-1 h-3 w-3" />{" "}
                          {revealing === b.id ? "Revealing…" : "Reveal"}
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
export function MemberDialog({
  title,
  row,
  consequence,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  row: { memberId: string; name: string };
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

/** What a Member's RERA state is made of, wherever it is edited. */
export type MemberRera = {
  reraStatus: string;
  reraNumber: string | null;
  reraExpiryDate: string | null;
  reraNotApplicableReason: string | null;
};

/** The RERA block, shared by activation and the standalone update. */
export function ReraFields({ row }: { row?: MemberRera }) {
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
            <PersonPicker
              name="personId"
              required
              placeholder="Search a Person by name or mobile"
              options={activatable}
            />
          </Field>
        ) : (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <Field label="Full Name">
              <Input name="fullName" required placeholder="e.g. Samir Sain" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Primary Mobile">
                <Input name="mobile" required placeholder="9876543210" inputMode="tel" />
              </Field>
              <Field label="City">
                <Input name="city" placeholder="Jaipur" />
              </Field>
            </div>
          </div>
        )}

        <Field label="Invited By — position and rate band are taken under this Member">
          <PersonPicker
            name="invitedByMemberId"
            placeholder="Root Member — or search by name or Member ID"
            options={rows
              .filter((r) => r.status === "ACTIVE")
              .map((r) => ({ id: r.id, label: `${r.memberId} · ${r.name}` }))}
          />
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
