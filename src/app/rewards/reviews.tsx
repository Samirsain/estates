"use client";

// Release-control reviews — Change Pack §55, §58, §65 NT08/NT09. One list per
// review type; each decision takes a compulsory note and is audited.

import React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { decideCircumventionAction, decideStaffConflictAction, type ActionResult } from "./review-actions";

export type ReviewRow = {
  id: string;
  kind: "CONFLICT" | "CIRCUMVENTION";
  person: string;
  personId: string;
  benefit: string;
  detail: string;
  status: string;
  decided: string | null;
};

const newKey = () => `rev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const TH = "px-2 py-1.5 text-left font-medium text-muted-foreground";
const TD = "px-2 py-1.5";

export function Reviews({ rows, role }: { rows: ReviewRow[]; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [deciding, setDeciding] = React.useState<{ row: ReviewRow; yes: boolean } | null>(null);

  const canDecide = (row: ReviewRow) =>
    row.kind === "CONFLICT" ? role === "MD" && row.status === "PENDING" : (role === "ACCOUNTS" || role === "MD") && row.status === "PENDING_REVIEW";

  return (
    <div className="space-y-2 p-2">
      {notice && <p className={`text-xs ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.ok ? notice.message : notice.error}</p>}
      <table className="w-full min-w-[44rem] text-xs">
        <thead className="border-b border-border/50">
          <tr>
            <th className={TH}>Review</th>
            <th className={TH}>Person</th>
            <th className={TH}>Benefit / link</th>
            <th className={TH}>Status</th>
            <th className={TH} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className={`${TD} text-muted-foreground`} colSpan={5}>
                No staff-conflict or circumvention reviews.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/30">
              <td className={TD}>{r.kind === "CONFLICT" ? "Staff / relative conflict (NT09)" : "Recovery circumvention (NT08)"}</td>
              <td className={TD}>
                <a className="text-primary hover:underline" href={`/people/${r.personId}`}>
                  {r.person}
                </a>
              </td>
              <td className={TD}>
                {r.benefit}
                <span className="block text-[11px] text-muted-foreground">{r.detail}</span>
              </td>
              <td className={TD}>
                <Badge
                  variant={
                    r.status.startsWith("PENDING")
                      ? "warning"
                      : r.status === "APPROVED" || r.status === "CLEARED"
                        ? "success"
                        : r.status === "CANCELLED"
                          ? "outline"
                          : "destructive"
                  }
                >
                  {r.status.replaceAll("_", " ").toLowerCase()}
                </Badge>
                {r.decided && <span className="block text-[11px] text-muted-foreground">{r.decided}</span>}
              </td>
              <td className={`${TD} whitespace-nowrap text-right`}>
                {canDecide(r) && (
                  <span className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => setDeciding({ row: r, yes: true })}>
                      {r.kind === "CONFLICT" ? "Approve" : "Clear"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeciding({ row: r, yes: false })}>
                      {r.kind === "CONFLICT" ? "Reject" : "Restrict"}
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {deciding && (
        <Modal
          title={`${deciding.yes ? (deciding.row.kind === "CONFLICT" ? "Approve" : "Clear") : deciding.row.kind === "CONFLICT" ? "Reject" : "Restrict"} — ${deciding.row.person}`}
          description={
            deciding.row.kind === "CONFLICT"
              ? "MD decides. A conflicted MD cannot decide their own or their relative's benefit; another MD must."
              : "Restricted keeps this Person's benefits held while the linked Recovery is outstanding. Nobody is denied automatically."
          }
          onClose={() => setDeciding(null)}
        >
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const note = String(new FormData(e.currentTarget).get("note") ?? "");
              setBusy(true);
              const { row, yes } = deciding;
              const result =
                row.kind === "CONFLICT"
                  ? await decideStaffConflictAction(row.id, yes, note, newKey())
                  : await decideCircumventionAction(row.id, yes, note, newKey());
              setBusy(false);
              setNotice(result);
              if (result.ok) {
                setDeciding(null);
                router.refresh();
              }
            }}
          >
            <Field label="Reason — compulsory, kept in the audit">
              <input name="note" required minLength={3} className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDeciding(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
