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
  type CommissionDraftInput,
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
};

/** CP §8 "Reward Programme References" — the company-wide Royalty Gift Programme in force. */
export type RoyaltyProgrammeRef = { version: number; programmeRef: string; catalogueVersion: string; termsVersion: string } | null;

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

function Terms({
  v,
  plotNo,
  royalty,
}: {
  v: CommissionVersionView;
  plotNo: (id: string) => string;
  royalty: RoyaltyProgrammeRef;
}) {
  const decided = v.status === "REJECTED" ? "Rejected by" : "Approved by";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Section n={1} title="Direct Commission">
        <Row label="Direct Enabled">{yesNo(v.directEnabled)}</Row>
        <Row label="Direct Rate %">
          <span className="font-medium">{direct(v)}</span>
        </Row>
        {v.directEnabled && <Row label="Milestone">25% Payment Received · self-purchase 100%</Row>}
      </Section>
      <Section n={2} title="Customer Loyalty">
        <Row label="Loyalty Enabled">{yesNo(v.loyaltyEnabled)}</Row>
        <Row label="Loyalty Rate %">
          <span className="font-medium">{loyalty(v)}</span>
        </Row>
        {v.loyaltyEnabled && <Row label="Milestone">100% Payment Received</Row>}
        {v.loyaltyExceptionReason && <Row label="MD commercial exception">{v.loyaltyExceptionReason}</Row>}
      </Section>
      <Section n={3} title="Trip Programme">
        <Row label="Trip Programme Enabled">{yesNo(v.trip !== null)}</Row>
        {v.trip && (
          <>
            <Row label="Trip Total Target">{v.trip.target}</Row>
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
      <Section n={4} title="Reward Programme References">
        {v.trip && (
          <>
            <Row label="Trip Programme Code">{v.trip.code}</Row>
            <Row label="Trip Programme Version">{v.trip.versionRef}</Row>
            <Row label="Trip Terms Version">{v.trip.termsRef}</Row>
            <Row label="Trip Cut-off">{v.trip.cutOffAt ? formatIst(v.trip.cutOffAt) : "—"}</Row>
            <Row label="Final Wind-down">{v.trip.windDownAt ? formatIst(v.trip.windDownAt) : "—"}</Row>
          </>
        )}
        <Row label="Royalty Gift Programme (company-wide)">
          {royalty ? `${royalty.programmeRef} v${royalty.version} · ${royalty.catalogueVersion} · ${royalty.termsVersion}` : "None live"}
        </Row>
      </Section>
      <Section n={5} title="Economics Review">
        <Row label="Economics Reviewed">
          {v.economicsReviewedAt
            ? `Yes · ${v.economicsReviewedByRef ?? ""} · ${formatIst(v.economicsReviewedAt)}`
            : v.trip
              ? "No — required before MD approval"
              : "No — not required without a Trip Programme"}
        </Row>
      </Section>
      <Section n={6} title="Version">
        <Row label="Status">{STATUS[v.status].label}</Row>
        <Row label="Prepared by">{v.preparedByRef}</Row>
        {v.decidedByRef && v.decidedAt && (
          <Row label={decided}>
            {v.decidedByRef} · {formatIst(v.decidedAt)}
          </Row>
        )}
        <Row label="Effective From">{v.effectiveFrom ? formatIst(v.effectiveFrom) : "On MD approval"}</Row>
        {v.effectiveTo && <Row label="Effective To">{formatIst(v.effectiveTo)}</Row>}
        <Row label="Reason">{v.reason}</Row>
        {v.decisionNote && <Row label="MD note">{v.decisionNote}</Row>}
      </Section>
    </div>
  );
}

export default function CommissionSettings({
  projectId,
  role,
  versions,
  plots,
  royaltyProgramme,
}: {
  projectId: string;
  role: string;
  versions: CommissionVersionView[];
  plots: PlotOption[];
  royaltyProgramme: RoyaltyProgrammeRef;
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
          <h2 className="text-sm font-semibold">Commercial &amp; Rewards settings</h2>
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
          <Terms v={active} plotNo={plotNo} royalty={royaltyProgramme} />
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
          <Terms v={open} plotNo={plotNo} royalty={royaltyProgramme} />
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
                      Direct {direct(v)} · Loyalty {loyalty(v)} · Trip {v.trip ? v.trip.code : "Disabled"}
                    </span>
                  </summary>
                  <div className="mt-2">
                    <Terms v={v} plotNo={plotNo} royalty={royaltyProgramme} />
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
  const [reason, setReason] = React.useState(start?.status === "DRAFT" ? start.reason : (defaultReason ?? ""));
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

  const value: CommissionDraftInput = {
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
  };

  const fields = (
    <>
        <FormSection n={1} title="Direct Commission">
          <Benefit
            label="Direct"
            max={DIRECT_MAX_PERCENT}
            enabled={directEnabled}
            value={directPercent}
            onEnabled={setDirectEnabled}
            onValue={setDirectPercent}
          />
        </FormSection>
        <FormSection n={2} title="Customer Loyalty">
          <Benefit
            label="Loyalty"
            max={LOYALTY_MAX_PERCENT}
            enabled={loyaltyEnabled}
            value={loyaltyPercent}
            onEnabled={setLoyaltyEnabled}
            onValue={setLoyaltyPercent}
          />
          {showException && (
            <Field label="MD commercial exception — why Loyalty is not lower than Direct (CP §7.3)">
              <textarea className={`${inputClass} h-16 py-2`} value={exception} onChange={(e) => setException(e.target.value)} />
            </Field>
          )}
        </FormSection>
        <FormSection n={3} title="Trip Programme">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={tripEnabled} onChange={(e) => setTripEnabled(e.target.checked)} />
            Trip Programme Enabled
          </label>
          {tripEnabled && (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Trip Total Target">
                  <input className={inputClass} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
                </Field>
                <Field label="Minimum Own-Sale Credits">
                  <input className={inputClass} inputMode="numeric" value={minOwn} onChange={(e) => setMinOwn(e.target.value)} />
                </Field>
                <Field label="Maximum Reference Credits">
                  <input className={inputClass} inputMode="numeric" value={maxRef} onChange={(e) => setMaxRef(e.target.value)} />
                </Field>
              </div>
              {plots.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Every Plot is eligible. Exclusions and shared credit pools are set on the Project page once the
                  inventory is prepared — edit this Draft there before sending it to MD.
                </p>
              ) : (
              <>
              <Field label="Excluded Plots — every other Plot is eligible (hold Ctrl to pick several)">
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
            </>
          )}
        </FormSection>
        {tripEnabled && (
          <FormSection n={4} title="Reward Programme References">
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Trip Programme Code">
                <input className={inputClass} placeholder="TRIP-A" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <Field label="Trip Programme Version">
                <input className={inputClass} placeholder="TRIP-A-2026-01" value={versionRef} onChange={(e) => setVersionRef(e.target.value)} />
              </Field>
              <Field label="Trip Terms Version">
                <input className={inputClass} placeholder="TRIP-TERMS-1.0" value={termsRef} onChange={(e) => setTermsRef(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Trip Cut-off — optional">
                <input type="datetime-local" className={inputClass} value={cutOff} onChange={(e) => setCutOff(e.target.value)} />
              </Field>
              <Field label="Final Wind-down — optional">
                <input type="datetime-local" className={inputClass} value={windDown} onChange={(e) => setWindDown(e.target.value)} />
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The Royalty Gift Programme is company-wide and is versioned in Administration. Economics Review is recorded by MD
              before approval.
            </p>
          </FormSection>
        )}
        <FormSection n={tripEnabled ? 5 : 4} title="Version">
          <Field label="Effective From — optional; empty takes effect on MD approval">
            <input type="datetime-local" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label="Reason — compulsory">
            <textarea className={`${inputClass} h-16 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </FormSection>
    </>
  );
  return { fields, value, problem };
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
  onSubmit: (input: CommissionDraftInput) => void;
}) {
  const draft = useCommercialRewardsDraft(start, plots);
  return (
    <Modal
      title="New Commercial & Rewards version"
      description="Saved as a Draft. Approved and Active versions are never edited; nothing changes until MD approves this one."
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
        {label} Enabled
      </label>
      <Field label={`${label} Rate % (max ${max}%)`}>
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

function FormSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-border/60 p-2.5">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {n}. {title}
      </legend>
      {children}
    </fieldset>
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
