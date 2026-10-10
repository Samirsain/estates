"use client";

// Commission settings — Business Model v2 SSOT §12–§16; Change Pack §7, §8.
//
// The Active version, any Draft, Pending or Approved-and-waiting one, and the
// history, on the Project page. Admin prepares, edits and sends; MD approves or
// rejects with a note. A version approved with a later Effective from waits as
// Approved until that time (CP §8 "Activate at approved effective time").
// Everyone else reads. The service is the control; the buttons only follow it.

import React from "react";
import { useRouter } from "next/navigation";
import {
  DIRECT_MAX_PERCENT,
  LOYALTY_MAX_PERCENT,
  needsLoyaltyException,
  rateLabel,
  validateCommissionTerms,
} from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import {
  decideCommissionVersionAction,
  prepareCommissionDraftAction,
  recordEconomicsReviewAction,
  sendCommissionVersionAction,
  type ActionResult,
  type TripDraftInput,
} from "../actions";

export type CommissionVersionView = {
  id: string;
  version: number;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED";
  directEnabled: boolean;
  directPercent: string | null;
  loyaltyEnabled: boolean;
  loyaltyPercent: string | null;
  loyaltyExceptionReason: string | null;
  reason: string;
  decisionNote: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** SSOT §12.3; CP §7.1 — null when the version's Trip Programme is Disabled. */
  trip: {
    target: number;
    minOwn: number;
    maxRef: number;
    code: string;
    versionRef: string;
    termsRef: string;
    cutOffAt: string | null;
    windDownAt: string | null;
    excludedPlotIds: string[];
    sharedPools: { plotId: string; parentPlotId: string }[];
  } | null;
  economicsReviewedAt: string | null;
};

type PlotOption = { id: string; plotNumber: string };

const STATUS: Record<CommissionVersionView["status"], { label: string; variant: "success" | "warning" | "outline" | "destructive" | "info" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  PENDING_APPROVAL: { label: "Waiting for MD", variant: "warning" },
  APPROVED: { label: "Approved", variant: "info" },
  ACTIVE: { label: "Active", variant: "success" },
  SUPERSEDED: { label: "Superseded", variant: "outline" },
  REJECTED: { label: "Rejected", variant: "destructive" },
};

const newKey = () => `cset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const direct = (v: CommissionVersionView) =>
  v.directEnabled && v.directPercent ? `${rateLabel(v.directPercent)}%` : "Disabled";
const loyalty = (v: CommissionVersionView) =>
  v.loyaltyEnabled && v.loyaltyPercent ? `${rateLabel(v.loyaltyPercent)}%` : "Disabled";

function Terms({ v, plotNo }: { v: CommissionVersionView; plotNo: (id: string) => string }) {
  return (
    <dl className="space-y-1 text-xs">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Direct Commission</dt>
        <dd className="font-medium">
          {direct(v)}
          {v.directEnabled && (
            <span className="ml-1 font-normal text-muted-foreground">at 25% paid · self-purchase at 100%</span>
          )}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Customer Loyalty</dt>
        <dd className="font-medium">
          {loyalty(v)}
          {v.loyaltyEnabled && <span className="ml-1 font-normal text-muted-foreground">at 100% paid</span>}
        </dd>
      </div>
      {v.loyaltyExceptionReason && (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">MD exception</dt>
          <dd className="text-right">{v.loyaltyExceptionReason}</dd>
        </div>
      )}
      {v.status !== "ACTIVE" && v.status !== "SUPERSEDED" && (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Effective from</dt>
          <dd className="text-right">{v.effectiveFrom ? formatIst(v.effectiveFrom) : "On MD approval"}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Trip Programme</dt>
        <dd className="text-right font-medium">
          {v.trip ? (
            <>
              {v.trip.code} · target {v.trip.target} · min Own {v.trip.minOwn} · max Reference {v.trip.maxRef}
              <span className="block font-normal text-muted-foreground">
                {v.trip.versionRef} · Terms {v.trip.termsRef}
                {v.trip.cutOffAt ? ` · cut-off ${formatIst(v.trip.cutOffAt)}` : ""}
                {v.trip.windDownAt ? ` · wind-down ${formatIst(v.trip.windDownAt)}` : ""}
              </span>
              {(v.trip.excludedPlotIds.length > 0 || v.trip.sharedPools.length > 0) && (
                <span className="block font-normal text-muted-foreground">
                  {v.trip.excludedPlotIds.length > 0 && `Excluded: ${v.trip.excludedPlotIds.map((id) => plotNo(id)).join(", ")}. `}
                  {v.trip.sharedPools.length > 0 &&
                    `Shared pools: ${v.trip.sharedPools.map((sp) => `${plotNo(sp.plotId)} → ${plotNo(sp.parentPlotId)}`).join(", ")}.`}
                </span>
              )}
              {v.economicsReviewedAt && (
                <span className="block font-normal text-muted-foreground">
                  Economics reviewed {formatIst(v.economicsReviewedAt)}
                </span>
              )}
            </>
          ) : (
            "Disabled"
          )}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Reason</dt>
        <dd className="text-right">{v.reason}</dd>
      </div>
    </dl>
  );
}

export default function CommissionSettings({
  projectId,
  role,
  versions,
  plots,
}: {
  projectId: string;
  role: string;
  versions: CommissionVersionView[];
  plots: PlotOption[];
}) {
  const plotNo = (id: string) => plots.find((p) => p.id === id)?.plotNumber ?? "?";
  const [reviewing, setReviewing] = React.useState(false);
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [deciding, setDeciding] = React.useState<boolean | null>(null);

  const active = versions.find((v) => v.status === "ACTIVE") ?? null;
  const open =
    versions.find((v) => v.status === "DRAFT" || v.status === "PENDING_APPROVAL" || v.status === "APPROVED") ?? null;
  const history = versions.filter((v) => v !== active && v !== open);
  const isAdmin = role === "ADMIN";
  const isMd = role === "MD";

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNotice(result);
    if (result.ok) {
      setEditing(false);
      setDeciding(null);
      router.refresh();
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Commission settings</h2>
          <p className="text-xs text-muted-foreground">
            Applicable Direct Commission is Project-specific and disclosed before the relevant Booking.
          </p>
        </div>
        {isAdmin && !open && (
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            Prepare new version
          </Button>
        )}
      </div>

      {notice && (
        <p className={`text-xs ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>
          {notice.ok ? notice.message : notice.error}
        </p>
      )}

      {active ? (
        <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold">Version {active.version}</span>
            <Badge variant="success">Active</Badge>
            {active.effectiveFrom && (
              <span className="text-muted-foreground">since {formatIst(active.effectiveFrom)}</span>
            )}
          </div>
          <Terms v={active} plotNo={plotNo} />
        </div>
      ) : (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800">
          No approved settings. Booking Requests on this Project cannot be submitted until MD approves a
          version.
        </p>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">Version {open.version}</span>
            <Badge variant={STATUS[open.status].variant}>{STATUS[open.status].label}</Badge>
            <div className="ml-auto flex gap-1.5">
              {isAdmin && open.status === "DRAFT" && (
                <>
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    disabled={busy}
                    onClick={() => run(() => sendCommissionVersionAction(open.id, newKey()))}
                  >
                    Send to MD
                  </Button>
                </>
              )}
              {isMd && open.status === "PENDING_APPROVAL" && open.trip && !open.economicsReviewedAt && (
                <Button size="xs" variant="outline" disabled={busy} onClick={() => setReviewing(true)}>
                  Economics reviewed
                </Button>
              )}
              {isMd && open.status === "PENDING_APPROVAL" && (
                <>
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => setDeciding(false)}>
                    Reject
                  </Button>
                  <Button size="xs" disabled={busy} onClick={() => setDeciding(true)}>
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
          <Terms v={open} plotNo={plotNo} />
        </div>
      )}

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">History ({history.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {history.map((v) => (
              <li key={v.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">v{v.version}</span>
                <span>{STATUS[v.status].label}</span>
                <span className="text-muted-foreground">
                  Direct {direct(v)} · Loyalty {loyalty(v)}
                </span>
                {v.decisionNote && <span className="text-muted-foreground">— {v.decisionNote}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <VersionForm
          busy={busy}
          plots={plots}
          start={open?.status === "DRAFT" ? open : active}
          onClose={() => setEditing(false)}
          onSubmit={(input) => run(() => prepareCommissionDraftAction(projectId, input, newKey()))}
        />
      )}

      {reviewing && open && (
        <Modal
          title="Economics reviewed"
          description="Confirms the Trip Programme's economics — Trip cost and Own + Reference exposure against margin — were reviewed outside the CRM. Only the fact, you and the date are kept."
          onClose={() => setReviewing(false)}
        >
          <ReviewNote
            busy={busy}
            onSubmit={(note) =>
              run(async () => {
                const result = await recordEconomicsReviewAction(open.id, note, newKey());
                if (result.ok) setReviewing(false);
                return result;
              })
            }
          />
        </Modal>
      )}

      {deciding !== null && open && (
        <DecisionForm
          approve={deciding}
          version={open.version}
          busy={busy}
          onClose={() => setDeciding(null)}
          onSubmit={(note) => run(() => decideCommissionVersionAction(open.id, deciding, note, newKey()))}
        />
      )}
    </Card>
  );
}

function ReviewNote({ busy, onSubmit }: { busy: boolean; onSubmit: (note: string) => void }) {
  const [note, setNote] = React.useState("");
  return (
    <div className="space-y-3">
      <Field label="Note (compulsory)">
        <textarea className={`${inputClass} h-16 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !note.trim()} onClick={() => onSubmit(note)}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

/** "A-10B=A-10A" lines → shared pools, by Plot Number. */
function parsePools(text: string, plots: PlotOption[]): { pools: { plotId: string; parentPlotId: string }[]; problem: string | null } {
  const byNo = new Map(plots.map((p) => [p.plotNumber.trim().toUpperCase(), p.id]));
  const pools: { plotId: string; parentPlotId: string }[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [child, parent] = line.split("=").map((x) => x?.trim().toUpperCase());
    const plotId = child ? byNo.get(child) : undefined;
    const parentPlotId = parent ? byNo.get(parent) : undefined;
    if (!plotId || !parentPlotId) return { pools, problem: `"${line}" — use CHILD=PARENT with Plot Numbers of this Project.` };
    pools.push({ plotId, parentPlotId });
  }
  return { pools, problem: null };
}

function VersionForm({
  start,
  busy,
  plots,
  onClose,
  onSubmit,
}: {
  start: CommissionVersionView | null;
  busy: boolean;
  plots: PlotOption[];
  onClose: () => void;
  onSubmit: (input: {
    directEnabled: boolean;
    directPercent: string | null;
    loyaltyEnabled: boolean;
    loyaltyPercent: string | null;
    loyaltyExceptionReason: string | null;
    reason: string;
    effectiveFrom: string | null;
    trip: TripDraftInput | null;
  }) => void;
}) {
  const t = start?.trip ?? null;
  const [tripEnabled, setTripEnabled] = React.useState(t !== null);
  const [target, setTarget] = React.useState(String(t?.target ?? ""));
  const [minOwn, setMinOwn] = React.useState(String(t?.minOwn ?? ""));
  const [maxRef, setMaxRef] = React.useState(String(t?.maxRef ?? ""));
  const [code, setCode] = React.useState(t?.code ?? "");
  const [versionRef, setVersionRef] = React.useState(t?.versionRef ?? "");
  const [termsRef, setTermsRef] = React.useState(t?.termsRef ?? "");
  const [cutOff, setCutOff] = React.useState(t?.cutOffAt ? toLocalInput(t.cutOffAt) : "");
  const [windDown, setWindDown] = React.useState(t?.windDownAt ? toLocalInput(t.windDownAt) : "");
  const [excluded, setExcluded] = React.useState<string[]>(t?.excludedPlotIds ?? []);
  const [poolText, setPoolText] = React.useState(
    (t?.sharedPools ?? [])
      .map((sp) => `${plots.find((p) => p.id === sp.plotId)?.plotNumber}=${plots.find((p) => p.id === sp.parentPlotId)?.plotNumber}`)
      .join("\n")
  );
  const pools = parsePools(poolText, plots);
  const [directEnabled, setDirectEnabled] = React.useState(start?.directEnabled ?? true);
  const [directPercent, setDirectPercent] = React.useState(
    start?.directPercent ? rateLabel(start.directPercent) : "3"
  );
  const [loyaltyEnabled, setLoyaltyEnabled] = React.useState(start?.loyaltyEnabled ?? true);
  const [loyaltyPercent, setLoyaltyPercent] = React.useState(
    start?.loyaltyPercent ? rateLabel(start.loyaltyPercent) : "1"
  );
  const [exception, setException] = React.useState(start?.loyaltyExceptionReason ?? "");
  const [reason, setReason] = React.useState(start?.status === "DRAFT" ? start.reason : "");
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time; empty means "on MD approval".
  const [effectiveFrom, setEffectiveFrom] = React.useState(
    start?.status === "DRAFT" && start.effectiveFrom ? toLocalInput(start.effectiveFrom) : ""
  );

  const terms = {
    directEnabled,
    directPercent: directEnabled ? directPercent : null,
    loyaltyEnabled,
    loyaltyPercent: loyaltyEnabled ? loyaltyPercent : null,
    loyaltyExceptionReason: exception.trim() || null,
  };
  const showException = needsLoyaltyException(terms);
  const check = validateCommissionTerms(terms);
  const whole = (x: string) => (/^\d+$/.test(x.trim()) ? Number(x) : NaN);
  const tripProblem = !tripEnabled
    ? null
    : !(whole(target) > 0)
      ? "Trip Total Target must be a whole number above 0."
      : !(whole(minOwn) >= 0 && whole(minOwn) <= whole(target))
        ? "Minimum Own-Sale Credits must be from 0 to the Total Target."
        : !(whole(maxRef) >= 0 && whole(maxRef) <= whole(target))
          ? "Maximum Reference Credits must be from 0 to the Total Target."
          : !code.trim() || !versionRef.trim() || !termsRef.trim()
            ? "Enter the Trip Programme code, version and Terms version."
            : pools.problem;
  const problem = !check.ok
    ? check.reason
    : tripProblem
      ? tripProblem
      : !reason.trim()
      ? "Write the reason for this version."
      : effectiveFrom && new Date(effectiveFrom) <= new Date()
        ? "Effective from must be in the future, or left empty to take effect on MD approval."
        : null;

  return (
    <Modal
      title="Commission settings"
      description="Saved as a Draft. Nothing changes until MD approves it."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Benefit
          label="Direct Commission"
          max={DIRECT_MAX_PERCENT}
          enabled={directEnabled}
          value={directPercent}
          onEnabled={setDirectEnabled}
          onValue={setDirectPercent}
        />
        <Benefit
          label="Customer Loyalty"
          max={LOYALTY_MAX_PERCENT}
          enabled={loyaltyEnabled}
          value={loyaltyPercent}
          onEnabled={setLoyaltyEnabled}
          onValue={setLoyaltyPercent}
        />
        {showException && (
          <Field label="MD exception — why Loyalty is not lower than Direct">
            <textarea
              className={`${inputClass} h-16 py-2`}
              value={exception}
              onChange={(e) => setException(e.target.value)}
            />
          </Field>
        )}
        <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={tripEnabled} onChange={(e) => setTripEnabled(e.target.checked)} />
            Sales &amp; Reference Trip Programme
          </label>
          {tripEnabled && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Total Target">
                  <input className={inputClass} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
                </Field>
                <Field label="Minimum Own">
                  <input className={inputClass} inputMode="numeric" value={minOwn} onChange={(e) => setMinOwn(e.target.value)} />
                </Field>
                <Field label="Maximum Reference">
                  <input className={inputClass} inputMode="numeric" value={maxRef} onChange={(e) => setMaxRef(e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Programme code">
                  <input className={inputClass} placeholder="TRIP-A" value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
                <Field label="Programme version">
                  <input className={inputClass} value={versionRef} onChange={(e) => setVersionRef(e.target.value)} />
                </Field>
                <Field label="Trip Terms version">
                  <input className={inputClass} value={termsRef} onChange={(e) => setTermsRef(e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Programme cut-off — optional">
                  <input type="datetime-local" className={inputClass} value={cutOff} onChange={(e) => setCutOff(e.target.value)} />
                </Field>
                <Field label="Final wind-down deadline — optional">
                  <input type="datetime-local" className={inputClass} value={windDown} onChange={(e) => setWindDown(e.target.value)} />
                </Field>
              </div>
              <Field label="Excluded Plots (every other Plot is eligible)">
                <select
                  multiple
                  className={`${inputClass} h-24 py-1`}
                  value={excluded}
                  onChange={(e) => setExcluded([...e.target.selectedOptions].map((o) => o.value))}
                >
                  {plots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plotNumber}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Shared credit pools — one CHILD=PARENT per line (SSOT §44)">
                <textarea className={`${inputClass} h-14 py-2`} value={poolText} onChange={(e) => setPoolText(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <Field label="Effective from — optional; empty takes effect on MD approval">
          <input
            type="datetime-local"
            className={inputClass}
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </Field>
        <Field label="Reason for this version">
          <textarea className={`${inputClass} h-16 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {problem && <p className="text-xs text-red-700">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || problem !== null}
            onClick={() =>
              onSubmit({
                ...terms,
                loyaltyExceptionReason: showException ? terms.loyaltyExceptionReason : null,
                reason,
                effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
                trip: tripEnabled
                  ? {
                      tripTotalTarget: Number(target),
                      tripMinOwnCredits: Number(minOwn),
                      tripMaxReferenceCredits: Number(maxRef),
                      tripProgrammeCode: code,
                      tripProgrammeVersionRef: versionRef,
                      tripTermsVersionRef: termsRef,
                      tripCutOffAt: cutOff ? new Date(cutOff).toISOString() : null,
                      tripWindDownAt: windDown ? new Date(windDown).toISOString() : null,
                      excludedPlotIds: excluded,
                      sharedPools: pools.pools,
                    }
                  : null,
              })
            }
          >
            Save Draft
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Benefit({
  label,
  max,
  enabled,
  value,
  onEnabled,
  onValue,
}: {
  label: string;
  max: string;
  enabled: boolean;
  value: string;
  onEnabled: (v: boolean) => void;
  onValue: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-3">
      <label className="flex h-9 items-center gap-2 text-xs font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        {label}
      </label>
      <Field label={`Rate % (max ${max}%)`}>
        <input
          className={inputClass}
          inputMode="decimal"
          disabled={!enabled}
          value={enabled ? value : ""}
          placeholder={enabled ? "" : "Disabled"}
          onChange={(e) => onValue(e.target.value)}
        />
      </Field>
    </div>
  );
}

function DecisionForm({
  approve,
  version,
  busy,
  onClose,
  onSubmit,
}: {
  approve: boolean;
  version: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = React.useState("");
  return (
    <Modal
      title={approve ? `Approve version ${version}` : `Reject version ${version}`}
      description={
        approve
          ? "It becomes Active at its Effective from — now, if none was set. New Booking Requests freeze it from then; existing ones keep theirs."
          : "The Active version stays in force."
      }
      onClose={onClose}
    >
      <Field label="Note (compulsory)">
        <textarea className={`${inputClass} h-16 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant={approve ? "default" : "destructive"}
          disabled={busy || !note.trim()}
          onClick={() => onSubmit(note)}
        >
          {approve ? "Approve" : "Reject"}
        </Button>
      </div>
    </Modal>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
