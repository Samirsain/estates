"use client";

// Members — design.md §13.1, §13.2; prd-corrections.md §13, §14.3.
// Actions are hidden by permission for clarity; the server re-checks every one.

import { eligibilityLabel } from "@/lib/domain/commission";
import React from "react";
import { safely } from "@/lib/safely";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Eye, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IdentityFacts } from "@/components/protected-identity";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AADHAAR_INPUT, ACCOUNT_NUMBER_INPUT, IFSC_INPUT, MOBILE_INPUT, PAN_INPUT } from "@/components/ui/field-formats";
import { Field, Modal, inputClass, ModalError } from "@/components/ui/modal";
import { formatIst, istDay, type StaffRole, formatIstDate } from "@/lib/tasks";
import {
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
import { MemberBusinessFields, readMemberBusiness } from "@/components/member-business-fields";
import { RemarkSelect } from "@/components/ui/remark-select";
import { LIST_TD, LIST_TH } from "@/components/ui/list-table";
import { cn } from "@/lib/utils";
import type { RemarkPresetKey } from "@/lib/remark-presets";

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
  reraStatus: string;
  reraNumber: string | null;
  reraExpiryDate: string | null;
  reraNotApplicableReason: string | null;
  commissionHold: boolean;
  commissionHoldReason: string | null;
  aadhaarStatus: string;
  panStatus: string;
  aadhaarMasked: string;
  panMasked: string;
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
  viewFullIdentity: boolean;
};

const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Recovery Pending",
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
  permissions,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: MemberRowView[];
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
    const result = await safely(action);
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
    // The refusal shows inside the open dialog; behind it, nobody saw it.
    <ModalError.Provider value={notice?.kind === "error" ? notice.text : null}>
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Owner 2 Nov — the same page as Customers: one rhythm, one header
            height, one grid. */}
        <header className="flex min-h-9 flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          {permissions.activate && (
            <Button size="sm" variant="gradient" onClick={() => setDialog({ kind: "ACTIVATE" })}>
              <Plus className="mr-1 h-4 w-4" /> Add Member
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
            className="h-9 w-80"
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

        {/* Owner 2 Nov — edge to edge, equal spacing, every column centred:
            the same grid table as Customers (components/ui/list-table). */}
        <div className="overflow-x-auto">
          <table role="table" className="grid w-full min-w-[62rem] grid-cols-[repeat(6,auto)] text-xs">
            <thead role="rowgroup" className="contents text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr role="row" className="contents">
                {/* One fact per column. Position and Member since moved into
                    the Member's own panel — they are read when a Member is
                    being looked at, not scanned down a list — and what the list
                    is scanned for took their place. */}
                <th role="columnheader" className={LIST_TH}>Member ID</th>
                <th role="columnheader" className={LIST_TH}>Name</th>
                <th role="columnheader" className={LIST_TH}>Mobile</th>
                <th role="columnheader" className={LIST_TH}>City</th>
                <th role="columnheader" className={LIST_TH}>Invited by</th>
                <th role="columnheader" className={LIST_TH}>Total Deals</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="contents">
              {visible.length === 0 && (
                <tr role="row" className="contents">
                  <td role="cell" className="col-span-full px-3 py-10 text-center text-sm text-muted-foreground">
                    No Members match these filters.
                  </td>
                </tr>
              )}
              {visible.map((row) => {
                // A Deactivated Member's row is tinted red; twMerge lets its
                // hover replace the list's own.
                const td = cn(LIST_TD, row.status !== "ACTIVE" && "bg-red-500/5 text-red-700 group-hover:bg-red-500/10");
                return (
                <React.Fragment key={row.id}>
                  <tr
                    role="row"
                    className="group contents"
                    title={row.status === "ACTIVE" ? undefined : "Deactivated"}
                  >
                    <td role="cell" className={td}>
                      <button
                        type="button"
                        className="font-bold text-primary hover:underline"
                        onClick={() => router.push(`/members/${row.id}`)}
                        aria-label={`View details for ${row.memberId}`}
                      >
                        {row.memberId}
                      </button>
                    </td>
                    <td role="cell" className={td}>
                      <Link href={`/members/${row.id}`} className="text-foreground hover:underline">
                        {row.name}
                      </Link>
                      {/* These qualify the Member, not the name — they stay
                          under it because that is who they are about. */}
                      {row.commissionHold && (
                        <span className="block text-[11px] text-amber-800">Commission Hold</span>
                      )}
                    </td>
                    <td role="cell" className={cn(td, "tabular-nums")}>{row.mobile}</td>
                    <td role="cell" className={td}>{row.city}</td>
                    {/* Two lines read like the Customers Plot cell: the code in
                        orange, the name under it a size smaller. */}
                    <td role="cell" className={td}>
                      {row.invitedBy ? (
                        <Link href={`/members/${row.invitedBy.id}`} className="group/inviter block">
                          <span className="block font-semibold text-primary group-hover/inviter:underline">
                            {row.invitedBy.memberId}
                          </span>
                          <span className="block text-[11px] font-medium text-foreground">
                            {row.invitedBy.name}
                          </span>
                        </Link>
                      ) : (
                        <span className="font-semibold">3% Club</span>
                      )}
                    </td>
                    <td role="cell" className={cn(td, "tabular-nums")}>
                      {row.dealCount > 0 ? (
                        <span className="font-semibold text-foreground">{row.dealCount}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                  {openId === row.id && (
                    <tr role="row" className="contents">
                      <td role="cell" className="col-span-full px-1 pb-3">
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.kind === "ACTIVATE" && (
        <ActivateMemberDialogForm
          rows={rows}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmitNew={(input) => run(() => createAndActivateMemberAction(input, newKey()))}
        />
      )}

      {dialog?.kind === "BANK_ENTER" && (
        <Modal
          title={`Bank Details — ${dialog.row.memberId}`}
          description="Saved and verified on entry. One verified bank account = one Person: an account already verified for someone else needs proof of a genuine joint account and a separate Accounts/MD approval."
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
                <Input name="accountNumber" required {...ACCOUNT_NUMBER_INPUT} />
              </Field>
              <Field label="IFSC">
                <Input name="ifsc" required {...IFSC_INPUT} className="uppercase" />
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
          presets="bankDetails"
          kind={dialog.approve ? "Verified" : "Rejected"}
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
    </ModalError.Provider>
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
  const [tab, setTab] = React.useState<"NETWORK" | "COMMISSION" | "BANK" | "IDENTITY">("NETWORK");
  const [revealed, setRevealed] = React.useState<Record<string, string>>({});
  const [revealing, setRevealing] = React.useState<string | null>(null);
  const [revealError, setRevealError] = React.useState<string | null>(null);

  if (!detail || detail.id !== row.id) {
    return <Card className="p-4 text-xs text-muted-foreground">Loading Member details…</Card>;
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        {(["NETWORK", "COMMISSION", "BANK", "IDENTITY"] as const).map((t) => (
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
            {row.experience ? ` · ${row.experience} as a Member` : ""}.
          </p>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Members Invited
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
                      {m.activationDate ? `Activated ${formatIst(m.activationDate)}` : "Not activated"}
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
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.provisional ? "Provisional — final when the first purchase is paid in full" : "Final"}
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
              <table className="w-full min-w-[48rem] text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1">Booking</th>
                    <th className="py-1">Plot · Type / Project</th>
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
                      {/* Owner 2 Nov — Plot No. · Type, the Project under it. */}
                      <td className="py-1">
                        <span className="block whitespace-nowrap">
                          <span className="font-semibold">{c.plot}</span>
                          {c.plotType && (
                            <span className="text-muted-foreground">
                              {" · "}
                              {c.plotType.charAt(0) + c.plotType.slice(1).toLowerCase().replaceAll("_", " ")}
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] font-medium text-foreground">{c.project}</span>
                      </td>
                      <td className="py-1">{c.type}</td>
                      <td className="py-1 text-right tabular-nums">{c.percent}</td>
                      <td className="py-1">
                        {eligibilityLabel(c.eligibility)}
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
                      {b.jointAccountProof && (
                        <Badge variant="info" title={b.jointAccountProof}>
                          Joint account
                        </Badge>
                      )}
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

      {/* Aadhaar and PAN were on file but on no screen — the only way to read a
          Member's was Administration. They live with the Member now, masked,
          with the same logged reveal the Customer profile has. */}
      {tab === "IDENTITY" && (
        <div className="space-y-3 text-xs">
          <IdentityFacts
            personId={row.personId}
            canReveal={permissions.viewFullIdentity}
            aadhaarMasked={row.aadhaarMasked}
            aadhaarHint={statusHint(row.aadhaarStatus)}
            panMasked={row.panMasked}
            panHint={statusHint(row.panStatus)}
          />
        </div>
      )}
    </Card>
  );
}

/** AVAILABLE adds nothing to a number already on screen, so it says nothing. */
function statusHint(status: string): string | undefined {
  if (status === "AVAILABLE") return undefined;
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

/* ---------------------------------------------------------------- dialogs */

/** DESIGN §5.1 — record identifier, exact action, consequences, compulsory reason. */
export function MemberDialog({
  title,
  row,
  consequence,
  presets,
  kind,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  presets: RemarkPresetKey;
  kind: string;
  row: { memberId: string; name: string };
  /** Left out, the box shows the Member alone. */
  consequence?: string;
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
        {consequence && <p className="mt-1 text-muted-foreground">{consequence}</p>}
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        <Field label="Reason — compulsory">
          <RemarkSelect presets={presets} kind={kind} name="reason" required />
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
          <RemarkSelect
            presets="reraNotApplicable"
            name="reraNotApplicableReason"
            required
            defaultValue={row?.reraNotApplicableReason ?? ""}
          />
        </Field>
      )}
    </>
  );
}

/** A form section's heading — the same small caps as Edit details' "Bank". */
const FORM_SECTION = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function ActivateMemberDialogForm({
  rows,
  busy,
  onClose,
  onSubmitNew,
}: {
  rows: MemberRowView[];
  busy: boolean;
  onClose: () => void;
  onSubmitNew: (input: Parameters<typeof createAndActivateMemberAction>[0]) => void;
}) {
  // Owner, 10 Nov 2026 — no "Select Existing Person": the Person is typed in.
  // Someone already on file is matched on name and mobile and activated as
  // themselves (createAndActivateMemberAction).
  return (
    <Modal
      title="Add Member"
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmitNew({
            fullName: String(f.get("fullName")),
            mobile: String(f.get("mobile")),
            altMobile: String(f.get("altMobile") ?? ""),
            city: String(f.get("city") ?? ""),
            addressLine: String(f.get("addressLine") ?? ""),
            email: String(f.get("email") ?? ""),
            aadhaar: String(f.get("aadhaar") ?? ""),
            pan: String(f.get("pan") ?? ""),
            photoReceived: f.get("photoReceived") === "on",
            ...readMemberBusiness(f),
            invitedByMemberId: String(f.get("invitedByMemberId") ?? ""),
            reraStatus: String(f.get("reraStatus")) as "PENDING",
            reraNumber: String(f.get("reraNumber") ?? ""),
            reraExpiryDate: String(f.get("reraExpiryDate") ?? ""),
            reraNotApplicableReason: String(f.get("reraNotApplicableReason") ?? ""),
          });
        }}
      >
        {/* Four groups in the order the details usually arrive: who and how
            to reach them, their papers, their business, then the Membership
            itself. Headings as on Edit details' Bank section. */}
        <section className="space-y-3">
          <h3 className={FORM_SECTION}>Contact</h3>
          <Field label="Full Name">
            <Input name="fullName" required placeholder="e.g. Samir Sain" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="WhatsApp Number">
              <Input name="mobile" required {...MOBILE_INPUT} />
            </Field>
            <Field label="Alternate Mobile (optional)">
              <Input name="altMobile" {...MOBILE_INPUT} placeholder="Optional" />
            </Field>
            <Field label="City">
              <Input name="city" required placeholder="Jaipur" />
            </Field>
            <Field label="Email (optional)">
              <Input name="email" type="email" placeholder="name@example.com" />
            </Field>
          </div>
          <Field label="Address (optional)">
            <Input name="addressLine" placeholder="House, street, area" />
          </Field>
        </section>

        <section className="space-y-3 border-t border-border/60 pt-4">
          <h3 className={FORM_SECTION}>Identity</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Aadhaar Number (optional)">
              <Input name="aadhaar" {...AADHAAR_INPUT} />
            </Field>
            <Field label="PAN Number (optional)">
              <Input name="pan" {...PAN_INPUT} className="uppercase" />
            </Field>
          </div>
          <label className="flex w-fit items-center gap-2 text-sm">
            <input type="checkbox" name="photoReceived" className="h-4 w-4 accent-primary" />
            Photo Received
          </label>
        </section>

        <section className="space-y-3 border-t border-border/60 pt-4">
          <h3 className={FORM_SECTION}>Business</h3>
          <MemberBusinessFields />
        </section>

        <section className="space-y-3 border-t border-border/60 pt-4">
          <h3 className={FORM_SECTION}>Membership</h3>
          <Field label="Invited By — the Member who introduced them (optional)">
            <PersonPicker
              name="invitedByMemberId"
              placeholder="Root Member — or search by name or Member ID"
              options={rows
                .filter((r) => r.status === "ACTIVE")
                .map((r) => ({ id: r.id, label: `${r.memberId} · ${r.name}` }))}
            />
          </Field>
          <ReraFields />
        </section>

        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
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
