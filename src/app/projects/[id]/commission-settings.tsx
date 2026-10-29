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
import { Field, Modal } from "@/components/ui/modal";
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

/** The Rewards rule in the words the Member profile uses. */
const rewards = (v: CommissionVersionView) => (v.trip ? `${v.trip.target} sales = 1 Reward` : "Disabled");

/** One group of the version's terms: a quiet heading over label-left, value-right rows. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <dl className="mt-1">{children}</dl>
    </section>
  );
}

/** The same row as the facts in the card, so the box and its Details read alike. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 text-xs last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

function Terms({ v, plotNo }: { v: CommissionVersionView; plotNo: (id: string) => string }) {
  return (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <Section title="Commission">
        <Row label="Rate">{direct(v)}</Row>
        {v.directEnabled && <Row label="Payment">25% Payment Received · self-purchase 100%</Row>}
      </Section>
      <Section title="Loyalty Points">
        <Row label="Rate">{loyalty(v)}</Row>
        {v.loyaltyEnabled && <Row label="Payment">100% Payment Received</Row>}
        {v.loyaltyExceptionReason && <Row label="MD commercial exception">{v.loyaltyExceptionReason}</Row>}
      </Section>
      <Section title="Royalty Points">
        <Row label="Points per qualifying Royalty">
          {v.royaltyTokensPerAward != null
            ? `${v.royaltyTokensPerAward} points`
            : "Not set — Booking Requests are refused until a version sets it"}
        </Row>
        <Row label="Earned by">The Royalty Linked Member, once per Customer</Row>
      </Section>
      <Section title="Rewards">
        {v.trip ? (
          <>
            <Row label="Target">{v.trip.target}</Row>
            <Row label="Minimum Own-Sale Credits">{v.trip.minOwn}</Row>
            <Row label="Maximum Reference Credits">{v.trip.maxRef}</Row>
            <Row label="Excluded Plots">
              {v.trip.excludedPlotIds.length ? v.trip.excludedPlotIds.map((id) => plotNo(id)).join(", ") : "None"}
            </Row>
            {v.trip.sharedPools.length > 0 && (
              <Row label="Shared credit pools">
                {v.trip.sharedPools.map((sp) => `${plotNo(sp.plotId)} → ${plotNo(sp.parentPlotId)}`).join(", ")}
              </Row>
            )}
          </>
        ) : (
          <Row label="Status">Disabled</Row>
        )}
      </Section>
    </div>
  );
}

/** The event Update → Edit commission sends to open the new-version form. */
export const OPEN_COMMISSION_FORM = "commission:new-version";

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
  const [showAll, setShowAll] = React.useState(false);


  const active = versions.find((v) => v.status === "ACTIVE") ?? null;
  const open =
    versions.find((v) => v.status === "DRAFT" || v.status === "PENDING_APPROVAL" || v.status === "APPROVED") ?? null;
  const history = versions.filter((v) => v !== active && v !== open);
  const isMd = role === "MD";
  // Update → Edit commission, at the top of the page, opens this form.
  React.useEffect(() => {
    if (!isMd) return;
    const open = () => setEditing(true);
    window.addEventListener(OPEN_COMMISSION_FORM, open);
    return () => window.removeEventListener(OPEN_COMMISSION_FORM, open);
  }, [isMd]);

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

  // One of three boxes beside Inventory and the PLC (owner, 28 Oct 2026): the
  // terms in force as rows, the way the PLC box reads; every section of every
  // version, and the history, open under Details.
  const fact = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );

  return (
    <Card className="p-3">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold text-foreground">Commission and Rewards</h2>
          {(active || open || history.length > 0) && (
            <button type="button" onClick={() => setShowAll(true)} className="text-xs text-primary hover:underline">
              Details
            </button>
          )}
        </div>

        {notice && (
          <p className={`text-xs ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>
            {notice.ok ? notice.message : notice.error}
          </p>
        )}

        {active ? (
          <dl>
            {fact("Commission", direct(active))}
            {fact("Loyalty Points", loyalty(active))}
            {fact("Royalty", `${active.royaltyTokensPerAward ?? "—"} points`)}
            {fact("Rewards", rewards(active))}
          </dl>
        ) : (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800">
            No settings yet. Booking Requests on this Project cannot be submitted until MD creates a version.
          </p>
        )}

        {open && (
          <p className="text-[11px] text-amber-800">
            Version {open.version} · {STATUS[open.status].label}
            {open.effectiveFrom ? ` · takes effect ${formatIst(open.effectiveFrom)}` : ""}
          </p>
        )}
      </section>

      {showAll && (
        <Modal
          title="Commission and Rewards"
          description="Applicable Commission is Project-specific and disclosed before the relevant Booking."
          wide
          onClose={() => setShowAll(false)}
        >
          <div className="space-y-3">
            {active ? (
              <div className="space-y-3 rounded-lg border border-border/60 p-3">
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
              <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
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
                            Commission {direct(v)} · Loyalty Points {loyalty(v)} · Royalty {v.royaltyTokensPerAward ?? "—"} points ·
                            Rewards {rewards(v)}
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
          </div>
        </Modal>
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
  const [excluded, setExcluded] = React.useState<string[]>(t?.excludedPlotIds ?? []);
  const [directEnabled, setDirectEnabled] = React.useState(start?.directEnabled ?? true);
  const [directPercent, setDirectPercent] = React.useState(
    start?.directPercent ? rateLabel(start.directPercent) : "3"
  );
  const [loyaltyEnabled, setLoyaltyEnabled] = React.useState(start?.loyaltyEnabled ?? true);
  const [loyaltyPercent, setLoyaltyPercent] = React.useState(
    start?.loyaltyPercent ? rateLabel(start.loyaltyPercent) : "1"
  );
  const [royaltyTokens, setRoyaltyTokens] = React.useState(String(start?.royaltyTokensPerAward ?? ""));
  // Reason and Effective From sit under Rewards (owner, 29 Oct 2026). Without
  // Rewards the audit still gets a reason, and the version takes effect when saved.
  const [reasonText, setReasonText] = React.useState(defaultReason ?? "");
  // A date only, "YYYY-MM-DD": empty or today takes effect now, a later date
  // at the start of that day (local time).
  const [effectiveFrom, setEffectiveFrom] = React.useState("");
  const reason = tripEnabled ? reasonText : defaultReason ?? "Commission and Rewards updated";
  const startsAt = tripEnabled && effectiveFrom ? new Date(`${effectiveFrom}T00:00`) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const terms = {
    directEnabled,
    directPercent: directEnabled ? directPercent : null,
    loyaltyEnabled,
    loyaltyPercent: loyaltyEnabled ? loyaltyPercent : null,
    // CP §7.3 — the MD exception field is off the form (owner, 29 Oct 2026);
    // the version's reason is the written reason.
    loyaltyExceptionReason: reason.trim() || null,
  };
  const showException = needsLoyaltyException(terms);
  // The rates only; the exception's written reason is the Reason, checked below.
  const check = validateCommissionTerms({ ...terms, loyaltyExceptionReason: "Reason" });
  const whole = (x: string) => (/^\d+$/.test(x.trim()) ? Number(x) : NaN);
  const tripProblem = !tripEnabled
    ? null
    : !(whole(target) > 0)
      ? "Target must be a whole number above 0."
      : !(whole(minOwn) >= 0 && whole(minOwn) <= whole(target))
        ? "Minimum Own-Sale Credits must be from 0 to the Total Target."
        : !(whole(maxRef) >= 0 && whole(maxRef) <= whole(target))
          ? "Maximum Reference Credits must be from 0 to the Total Target."
          : null;
  const tokenCheck = validateTokenQuantity("Royalty points per qualifying purchase", whole(royaltyTokens));
  // In the order the fields read, top to bottom.
  const problem = !check.ok
    ? check.reason
    : !tokenCheck.ok
      ? tokenCheck.reason
      : tripProblem
        ? tripProblem
        : startsAt && startsAt < today
          ? "Effective From cannot be in the past. Leave it empty to take effect now."
          : !reason.trim()
            ? "Write the reason for this version."
            : null;

  const value: CommissionDraftInput = {
    ...terms,
    loyaltyExceptionReason: showException ? terms.loyaltyExceptionReason : null,
    royaltyTokensPerAward: whole(royaltyTokens),
    reason,
    effectiveFrom: startsAt && startsAt > today ? startsAt.toISOString() : null,
    // CP §7.4 — the checkbox is off the form (owner, 29 Oct 2026); MD saving
    // Rewards is the confirmation the economics were reviewed.
    economicsReviewed: tripEnabled,
    trip: tripEnabled
      ? {
          tripTotalTarget: Number(target),
          tripMinOwnCredits: Number(minOwn),
          tripMaxReferenceCredits: Number(maxRef),
          // Off the form (owner, 29 Oct 2026): kept from the version this one
          // starts from, so the Rewards keep their identity across versions.
          tripProgrammeCode: t?.code ?? "RWD",
          tripProgrammeVersionRef: t?.versionRef ?? "RWD v1",
          tripTermsVersionRef: t?.termsRef ?? "RWD-TERMS-1",
          tripCutOffAt: t?.cutOffAt ?? null,
          tripWindDownAt: t?.windDownAt ?? null,
          excludedPlotIds: excluded,
          sharedPools: t?.sharedPools ?? [],
        }
      : null,
  };

  // The three rates on one row, then Rewards as its own group under a rule.
  // Rows align on the inputs, so a label that wraps never shifts its box.
  const fields = (
    <div className="space-y-3">
      <div className="grid items-end gap-3 sm:grid-cols-3">
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
      </div>

      <div className="space-y-3 border-t border-border/60 pt-3">
        <label className="flex w-fit items-center gap-2 text-xs font-semibold text-foreground">
          <input type="checkbox" checked={tripEnabled} onChange={(e) => setTripEnabled(e.target.checked)} />
          Rewards
        </label>
        {tripEnabled && (
          <>
            <div className="grid items-end gap-3 sm:grid-cols-3">
              <Field label="Target">
                <Input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
              </Field>
              <Field label="Minimum Own-Sale Credits">
                <Input inputMode="numeric" value={minOwn} onChange={(e) => setMinOwn(e.target.value)} />
              </Field>
              <Field label="Maximum Reference Credits">
                <Input inputMode="numeric" value={maxRef} onChange={(e) => setMaxRef(e.target.value)} />
              </Field>
            </div>
            {plots.length > 0 && (
              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-muted-foreground">Excluded Plots</legend>
                <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md border border-input px-3 py-2.5">
                  {plots.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-xs tabular-nums text-foreground">
                      <input
                        type="checkbox"
                        checked={excluded.includes(p.id)}
                        onChange={(e) =>
                          setExcluded(e.target.checked ? [...excluded, p.id] : excluded.filter((id) => id !== p.id))
                        }
                      />
                      {p.plotNumber}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <Field label="Effective From">
                <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </Field>
              <Field label="Reason">
                <RemarkSelect presets="commissionSettings" value={reasonText} onChange={setReasonText} required />
              </Field>
            </div>
          </>
        )}
      </div>
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
  // The problem shows once Save is pressed, not while the form is being filled.
  const [tried, setTried] = React.useState(false);
  return (
    <Modal
      title="Commission and Rewards"
      description={replacing ? `Saving replaces Version ${replacing}, which has not taken effect yet.` : undefined}
      onClose={onClose}
    >
      <div className="space-y-3">
        {draft.fields}
        {tried && draft.problem && <p className="text-xs text-red-700">{draft.problem}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => (draft.problem ? setTried(true) : onSubmit(draft.value))}>
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
