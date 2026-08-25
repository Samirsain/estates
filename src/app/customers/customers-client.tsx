"use client";

// Customers — DESIGN.md §12.1, §12.2.
// Sensitive values are masked unless the role holds explicit field permission,
// and revealing one is logged on the server (DESIGN §2.6, ARCHITECTURE §9.3).

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inputClass } from "@/components/ui/modal";
import { formatIst, type StaffRole } from "@/lib/tasks";
import { loadCustomerDetail, revealAadhaarAction, type CustomerDetail } from "./actions";

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export type CustomerRowView = {
  id: string;
  personId: string;
  customerId: string;
  name: string;
  mobileMasked: string;
  city: string;
  customerType: string | null;
  aadhaarEnding: string;
  aadhaarStatus: string;
  panStatus: string;
  introducedBy: string | null;
  loyaltySlotsConsumed: number;
  experience: string | null;
};

const ACTIVITY_VARIANT: Record<string, "info" | "warning" | "success"> = {
  Enquiry: "info",
  Hold: "warning",
  Booking: "success",
};

export default function CustomersClient({
  role,
  actorName,
  staffAccountId,
  rows,
  permissions,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: CustomerRowView[];
  permissions: { viewFullAadhaar: boolean; manageEnquiry: boolean };
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("ALL");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const visible = rows.filter(
    (r) =>
      (typeFilter === "ALL" || (r.customerType ?? "") === typeFilter) &&
      (search.trim() === "" ||
        `${r.customerId} ${r.name} ${r.city}`.toLowerCase().includes(search.trim().toLowerCase()))
  );

  async function openDetail(row: CustomerRowView) {
    if (openId === row.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(row.id);
    setDetail(null);
    setDetail(await loadCustomerDetail(row.id));
  }

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {visible.length} of {rows.length} · a Customer ID is created at the first Booking Request
            and is retained even if that request is rejected · times in Asia/Kolkata
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={filterClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by Customer Type"
          >
            <option value="ALL">All Customer Types</option>
            <option value="END_USER">End User</option>
            <option value="INVESTOR">Investor</option>
          </select>
          <Input
            className="h-9 w-64"
            placeholder="Search Customer ID, name or city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {notice && (
          <Card className="border-red-500/40 bg-red-500/5 p-4">
            <p role="status" className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {notice}
            </p>
          </Card>
        )}

        <Card className="overflow-x-auto p-2">
          <table className="w-full min-w-[54rem] border-separate border-spacing-y-1 text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Mobile · City</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Aadhaar</th>
                <th className="px-3 py-2">PAN</th>
                <th className="px-3 py-2">Invited By</th>
                <th className="px-3 py-2 text-right">Loyalty</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No Customers yet. A Customer ID is created when the first Booking Request is
                    submitted.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className="bg-secondary align-top">
                    <td className="rounded-l-xl px-3 py-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline group"
                        onClick={() => router.push(`/customers/${row.id}`)}
                        aria-label={`View details for ${row.customerId}`}
                      >
                        <Eye className="h-3.5 w-3.5 text-primary/70 group-hover:text-primary transition-colors" />
                        <span>{row.customerId}</span>
                      </button>
                      <span className="block text-[11px] text-muted-foreground">{row.name}</span>
                      {row.experience && (
                        <span className="block text-[11px] text-muted-foreground">
                          {row.experience} as a Customer
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {row.mobileMasked}
                      <span className="block text-[11px] text-muted-foreground">{row.city}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {row.customerType ? row.customerType.replaceAll("_", " ") : "Not recorded"}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {row.aadhaarEnding}
                      <span className="block text-[11px] text-muted-foreground">
                        {row.aadhaarStatus.charAt(0) + row.aadhaarStatus.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">{row.panStatus}</td>
                    <td className="px-3 py-3 text-xs">{row.introducedBy ?? "—"}</td>
                    <td className="rounded-r-xl px-3 py-3 text-right text-xs tabular-nums">
                      {row.loyaltySlotsConsumed}/3
                    </td>
                  </tr>
                  {openId === row.id && (
                    <tr>
                      <td colSpan={7} className="px-1 pb-3">
                        <CustomerDetailPanel
                          row={row}
                          detail={detail}
                          canReveal={permissions.viewFullAadhaar}
                          onError={setNotice}
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
    </AppShell>
  );
}

function CustomerDetailPanel({
  row,
  detail,
  canReveal,
  onError,
}: {
  row: CustomerRowView;
  detail: CustomerDetail | null;
  canReveal: boolean;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = React.useState<"ACTIVITY" | "IDENTITY" | "LOYALTY">("ACTIVITY");
  const [aadhaar, setAadhaar] = React.useState<string | null>(null);

  if (!detail || detail.id !== row.id) {
    return <Card className="p-4 text-xs text-muted-foreground">Loading Customer details…</Card>;
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        {(["ACTIVITY", "IDENTITY", "LOYALTY"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1 text-xs ${
              tab === t ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t === "ACTIVITY" ? "Property Activity" : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {tab === "ACTIVITY" && (
        <div className="space-y-2 text-xs">
          {detail.activity.length === 0 ? (
            <p className="text-muted-foreground">No Enquiries, Holds or Bookings yet.</p>
          ) : (
            <ul className="space-y-1">
              {detail.activity.map((a, index) => (
                <li key={index} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Badge variant={ACTIVITY_VARIANT[a.kind]}>{a.kind}</Badge>
                    {a.reference} · {a.project}
                    <span className="text-[11px] text-muted-foreground">{a.plot}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {a.status.replaceAll("_", " ").toLowerCase()} · {formatIst(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "IDENTITY" && (
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            Aadhaar is a protected field, never an uploaded document. Normal users see the last four
            digits only, and every full-value access is logged.
          </p>
          <div className="rounded-xl border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Aadhaar: {aadhaar ?? detail.aadhaarMasked}
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {detail.aadhaarStatus.charAt(0) + detail.aadhaarStatus.slice(1).toLowerCase()}
                </span>
              </span>
              {canReveal && !aadhaar && detail.aadhaarStatus !== "PENDING" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const result = await revealAadhaarAction(detail.personId);
                    if (result.ok) setAadhaar(result.aadhaar);
                    else onError(result.error);
                  }}
                >
                  <Eye className="mr-1 h-3 w-3" /> Reveal
                </Button>
              )}
            </div>
            <p className="mt-1">
              PAN: {detail.panMasked ?? "Not recorded"}
              <span className="ml-2 text-[11px] text-muted-foreground">
                {detail.panStatus === "NOT_AVAILABLE" ? "PAN Not Available" : "PAN Available"} — PAN
                never holds a commission by itself
              </span>
            </p>
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bank Details
            </h3>
            {detail.banks.length === 0 ? (
              <p className="mt-2 text-muted-foreground">No bank details recorded.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {detail.banks.map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {b.bankName} ending {b.accountLastFour} · {b.ifsc}
                    </span>
                    <Badge variant={b.status === "VERIFIED" ? "success" : "outline"}>
                      {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "LOYALTY" && (
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            A combined lifetime maximum of three Loyalty Bonuses, in any mix of introduced-buyer
            sales and repeat personal purchases. The limit never resets, and a slot reopens if a
            qualifying sale is cancelled before legal completion.
          </p>
          <p>
            Consumed: <span className="tabular-nums">{detail.loyaltyConsumed}/3</span>
          </p>
          {detail.loyaltySlots.length === 0 ? (
            <p className="text-muted-foreground">No Loyalty slot has been taken yet.</p>
          ) : (
            <ul className="space-y-1">
              {detail.loyaltySlots.map((slot) => (
                <li key={slot.slotIndex} className="flex flex-wrap justify-between gap-2">
                  <span>Slot {slot.slotIndex}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {slot.status === "CONSUMED"
                      ? `Consumed${slot.consumedAt ? ` on ${formatIst(slot.consumedAt)}` : ""}`
                      : `Open${slot.reopenedReason ? ` — reopened: ${slot.reopenedReason}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {detail.introducedBy && (
            <p className="text-muted-foreground">
              Introduced By {detail.introducedBy}
              {detail.introducedPosition
                ? ` · Royalty position ${detail.introducedPosition} · ${detail.introducedRatePercent}%`
                : ""}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
