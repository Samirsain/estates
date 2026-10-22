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
import { validateTokenQuantity } from "@/lib/domain/tokens";
import { formatIst } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { createCommissionVersionAction, type ActionResult, type CommissionDraftInput } from "../actions";
import { RemarkSelect } from "@/components/ui/remark-select";

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
  preparedByRef: string;
  decidedByRef: string | null;
  decidedAt: string | null;
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
  economicsReviewedByRef: string | null;
  /** docss/11 — whole tokens per qualifying Royalty; null only on a version from before tokens. */
  royaltyTokensPerAward: number | null;
};

export type PlotOption = { id: string; plotNumber: string };

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

/** CP §8 — one heading per section, numbered the same in the card and the form. */
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {n}. {title}
      </h3>
      <dl className="space-y-1 text-xs">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

function Terms({ v, plotNo }: { v: CommissionVersionView; plotNo: (id: string) => string }) {
  const decided = v.status === "REJECTED" ? "Rejected by" : "Approved by";
  // A version MD created is approved by that act — one line, not two.
  const selfApproved = v.decidedByRef === v.preparedByRef;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Section n={1} title="Commission">
        <Row label="Commission Enabled">{yesNo(v.directEnabled)}</Row>
        <Row label="Commission Rate %">
          <span className="font-medium">{direct(v)}</span>
        </Row>
        {v.directEnabled && <Row label="Payment">25% Payment Received · self-purchase 100%</Row>}
      </Section>
      <Section n={2} title="Loyalty Points">
        <Row label="Loyalty Points Enabled">{yesNo(v.loyaltyEnabled)}</Row>
        <Row label="Loyalty Points Rate %">
          <span className="font-medium">{loyalty(v)}</span>
        </Row>
        {v.loyaltyEnabled && <Row label="Payment">100% Payment Received</Row>}
        {v.loyaltyExceptionReason && <Row label="MD commercial exception">{v.loyaltyExceptionReason}</Row>}
      </Section>
      <Section n={3} title="Rewards">
        <Row label="Rewards Enabled">{yesNo(v.trip !== null)}</Row>
        {v.trip && (
          <>
            <Row label="Target">{v.trip.target}</Row>
            <Row label="Minimum Own-Sale Credits">{v.trip.minOwn}</Row>
            <Row label="Maximum Reference Credits">{v.trip.maxRef}</Row>
            <Row label="Excluded Plots">
              {v.trip.excludedPlotIds.length ? v.trip.excludedPlotIds.map((id) => plotNo(id)).join(", ") : "None — every Plot eligible"}
            </Row>
            {v.trip.sharedPools.length > 0 && (
              <Row label="Shared credit pools">
                {v.trip.sharedPools.map((sp) => `${plotNo(sp.plotId)} → ${plotNo(sp.parentPlotId)}`).join(", ")}
              </Row>
            )}
          </>
        )}
      </Section>
      <Section n={4} title="Royalty Points">
        <Row label="Points per qualifying Royalty">
          <span className="font-medium">
            {v.royaltyTokensPerAward ?? "Not set — Booking Requests are refused until a version sets it"}
          </span>
        </Row>
        <Row label="Earned by">The Royalty Linked Member, once per Customer</Row>
      </Section>
      <Section n={5} title="Rewards References">
        {v.trip && (
          <>
            <Row label="Rewards Code">{v.trip.code}</Row>
            <Row label="Rewards Version">{v.trip.versionRef}</Row>
            <Row label="Terms Version">{v.trip.termsRef}</Row>
            <Row label="Cut-off">{v.trip.cutOffAt ? formatIst(v.trip.cutOffAt) : "—"}</Row>
            <Row label="Final Wind-down">{v.trip.windDownAt ? formatIst(v.trip.windDownAt) : "—"}</Row>
          </>
        )}
        {!v.trip && <Row label="Rewards">Disabled</Row>}
      </Section>
      <Section n={6} title="Economics Review">
        <Row label="Economics Reviewed">
          {v.economicsReviewedAt
            ? `Yes · ${v.economicsReviewedByRef ?? ""} · ${formatIst(v.economicsReviewedAt)}`
            : v.trip
              ? "No"
              : "Not needed without Rewards"}
        </Row>
      </Section>
      <Section n={7} title="Version">
        <Row label="Status">{STATUS[v.status].label}</Row>
        <Row label={selfApproved ? "Created and approved by" : "Prepared by"}>{v.preparedByRef}</Row>
        {v.decidedByRef && v.decidedAt && !selfApproved && (
          <Row label={decided}>
            {v.decidedByRef} · {formatIst(v.decidedAt)}
          </Row>
        )}
        <Row label="Effective From">{v.effectiveFrom ? formatIst(v.effectiveFrom) : "—"}</Row>
        {v.effectiveTo && <Row label="Effective To">{formatIst(v.effectiveTo)}</Row>}
        <Row label="Reason">{v.reason}</Row>
        {v.decisionNote && v.decisionNote !== v.reason && <Row label="MD note">{v.decisionNote}</Row>}
      </Section>
    </div>
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
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [editing, setEditing] = React.useState(false);

  const active = versions.find((v) => v.status === "ACTIVE") ?? null;
  const open =
    versions.find((v) => v.status === "DRAFT" || v.status === "PENDING_APPROVAL" || v.status === "APPROVED") ?? null;
  const history = versions.filter((v) => v !== active && v !== open);
  const isMd = role === "MD";

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNotice(result);
    if (result.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Rewards settings</h2>
          <p className="text-xs text-muted-foreground">
            Applicable Commission is Project-specific and disclosed before the relevant Booking.
          </p>
        </div>
        {isMd && (
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            New version
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
          No settings yet. Booking Requests on this Project cannot be submitted until MD creates a version.
        </p>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">Version {open.version}</span>
            <Badge variant={STATUS[open.status].variant}>{STATUS[open.status].label}</Badge>
            {open.effectiveFrom && <span className="text-muted-foreground">takes effect {formatIst(open.effectiveFrom)}</span>}
          </div>
          <Terms v={open} plotNo={plotNo} />
        </div>
      )}

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Version History — read-only ({history.length})</summary>
          <ul className="mt-1.5 space-y-1.5">
            {history.map((v) => (
              <li key={v.id}>
                <details className="rounded-lg border border-border/40 p-2">
                  <summary className="flex cursor-pointer flex-wrap gap-x-2">
                    <span className="font-medium">Version {v.version}</span>
                    <Badge variant={STATUS[v.status].variant}>{STATUS[v.status].label}</Badge>
                    <span className="text-muted-foreground">
                      Commission {direct(v)} · Loyalty Points {loyalty(v)} · Rewards {v.trip ? v.trip.code : "Disabled"} · Royalty{" "}
                      {v.royaltyTokensPerAward ?? "—"} points
                    </span>
                  </summary>
                  <div className="mt-2">
                    <Terms v={v} plotNo={plotNo} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <VersionForm
          busy={busy}
          plots={plots}
          start={active}
          replacing={open?.version ?? null}
          onClose={() => setEditing(false)}
          onSubmit={(input) => run(() => createCommissionVersionAction(projectId, input, newKey()))}
        />
      )}

    </Card>
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

/**
 * CP §8; SSOT §12–§16 — the Commercial & Rewards fields, shared by the
 * new-Project form and a new version on the Project page, so a Project is
 * created with the same settings it is later changed through. Returns the
 * sections, the Draft as the browser sends it, and the first problem.
 */
export function useCommercialRewardsDraft(
  start: CommissionVersionView | null,
  plots: PlotOption[],
  defaultReason?: string
) {
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
  const [royaltyTokens, setRoyaltyTokens] = React.useState(String(start?.royaltyTokensPerAward ?? ""));
  const [reason, setReason] = React.useState(defaultReason ?? "");
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time; empty means "now".
  const [effectiveFrom, setEffectiveFrom] = React.useState("");
  // CP §7.4 — MD confirms the Rewards economics were reviewed outside the CRM.
  const [economicsReviewed, setEconomicsReviewed] = React.useState(false);

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
      ? "Target must be a whole number above 0."
      : !(whole(minOwn) >= 0 && whole(minOwn) <= whole(target))
        ? "Minimum Own-Sale Credits must be from 0 to the Total Target."
        : !(whole(maxRef) >= 0 && whole(maxRef) <= whole(target))
          ? "Maximum Reference Credits must be from 0 to the Total Target."
          : !code.trim() || !versionRef.trim() || !termsRef.trim()
            ? "Enter the Rewards code, version and Terms version."
            : pools.problem ?? (economicsReviewed ? null : "Confirm the Rewards economics were reviewed.");
  const tokenCheck = validateTokenQuantity("Royalty points per qualifying purchase", whole(royaltyTokens));
  const problem = !check.ok
    ? check.reason
    : !tokenCheck.ok
      ? tokenCheck.reason
      : tripProblem
      ? tripProblem
      : !reason.trim()
      ? "Write the reason for this version."
      : effectiveFrom && new Date(effectiveFrom) <= new Date()
        ? "Effective from must be in the future, or left empty to take effect now."
        : null;

  const value: CommissionDraftInput = {
    ...terms,
    loyaltyExceptionReason: showException ? terms.loyaltyExceptionReason : null,
    royaltyTokensPerAward: whole(royaltyTokens),
    reason,
    effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
    economicsReviewed: tripEnabled && economicsReviewed,
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
  };

  // One flat grid in the same Field-over-input style as the Project form it
  // sits under, so the two read as one form.
  const fields = (
    <div className="grid gap-3 md:grid-cols-2">
      <RateField
        label="Commission"
        max={DIRECT_MAX_PERCENT}
        enabled={directEnabled}
        value={directPercent}
        onEnabled={setDirectEnabled}
        onValue={setDirectPercent}
      />
      <RateField
        label="Loyalty Points"
        max={LOYALTY_MAX_PERCENT}
        enabled={loyaltyEnabled}
        value={loyaltyPercent}
        onEnabled={setLoyaltyEnabled}
        onValue={setLoyaltyPercent}
      />
      <Field label="Royalty points per qualifying purchase">
        <Input
          inputMode="numeric"
          placeholder="e.g. 10"
          value={royaltyTokens}
          onChange={(e) => setRoyaltyTokens(e.target.value)}
        />
      </Field>
      {showException && (
        <div className="md:col-span-2">
          <Field label="MD commercial exception — why Loyalty Points are not lower than Commission (CP §7.3)">
            <RemarkSelect presets="mdException" value={exception} onChange={setException} required />
          </Field>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:col-span-2">
        <input type="checkbox" checked={tripEnabled} onChange={(e) => setTripEnabled(e.target.checked)} />
        Rewards
      </label>
      {tripEnabled && (
        <>
          <Field label="Target">
            <Input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Minimum Own-Sale Credits">
            <Input inputMode="numeric" value={minOwn} onChange={(e) => setMinOwn(e.target.value)} />
          </Field>
          <Field label="Maximum Reference Credits">
            <Input inputMode="numeric" value={maxRef} onChange={(e) => setMaxRef(e.target.value)} />
          </Field>
          <Field label="Rewards Code">
            <Input placeholder="RWD-A" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Rewards Version">
            <Input placeholder="RWD-A-2026-01" value={versionRef} onChange={(e) => setVersionRef(e.target.value)} />
          </Field>
          <Field label="Terms Version">
            <Input placeholder="RWD-TERMS-1.0" value={termsRef} onChange={(e) => setTermsRef(e.target.value)} />
          </Field>
          <Field label="Cut-off (optional)">
            <Input type="datetime-local" value={cutOff} onChange={(e) => setCutOff(e.target.value)} />
          </Field>
          <Field label="Final Wind-down (optional)">
            <Input type="datetime-local" value={windDown} onChange={(e) => setWindDown(e.target.value)} />
          </Field>
          {plots.length > 0 && (
            <>
              <Field label="Excluded Plots (Ctrl to pick several)">
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
              <Field label="Shared credit pools — CHILD=PARENT per line">
                <textarea className={`${inputClass} h-24 py-2`} value={poolText} onChange={(e) => setPoolText(e.target.value)} />
              </Field>
            </>
          )}
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:col-span-2">
            <input type="checkbox" checked={economicsReviewed} onChange={(e) => setEconomicsReviewed(e.target.checked)} />
            Rewards economics reviewed (Reward cost and Own + Reference exposure against margin)
          </label>
        </>
      )}
      <Field label="Effective From (optional)">
        <Input type="datetime-local" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
      </Field>
      <Field label="Reason">
        <RemarkSelect presets="commissionSettings" value={reason} onChange={setReason} required />
      </Field>
    </div>
  );
  return { fields, value, problem };
}

function VersionForm({
  start,
  replacing,
  busy,
  plots,
  onClose,
  onSubmit,
}: {
  start: CommissionVersionView | null;
  /** A version still waiting for its Effective from, which saving replaces. */
  replacing: number | null;
  busy: boolean;
  plots: PlotOption[];
  onClose: () => void;
  onSubmit: (input: CommissionDraftInput) => void;
}) {
  const draft = useCommercialRewardsDraft(start, plots);
  return (
    <Modal
      title="New Rewards version"
      description={
        "Saved and approved at once. It becomes Active now, or at its Effective from. Earlier versions are never edited." +
        (replacing ? ` Saving replaces Version ${replacing}, which has not taken effect yet.` : "")
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        {draft.fields}
        {draft.problem && <p className="text-xs text-red-700">{draft.problem}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || draft.problem !== null} onClick={() => onSubmit(draft.value)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** A Field whose label carries the on/off box, so a rate costs one cell. */
function RateField({
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
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        {label} % (max {max}%)
      </label>
      <Input
        aria-label={`${label} %`}
        inputMode="decimal"
        disabled={!enabled}
        value={enabled ? value : ""}
        placeholder={enabled ? "" : "Disabled"}
        onChange={(e) => onValue(e.target.value)}
      />
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
