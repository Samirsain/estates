"use client";

/*
 * Plot Rate & Area Calculator.
 *
 * Everything on this screen is derived in the browser and thrown away when the
 * page closes. There is no server action here on purpose: the CRM stores no
 * rupee value (PRD §1.2), so a rate typed here is never sent anywhere, never
 * persisted, and never touches Payment Received, Payment Given, commission or
 * the Plot record itself.
 *
 * Area comes from calculateAreas(), the commission combination from
 * generateCommission() and the beneficiary conditions from resolveEligibility()
 * — the same three rules a real Booking runs, called here with facts read off
 * the people chosen. There is no second copy of the rate table, the bands, the
 * milestones or the 4% ceiling on this screen.
 *
 * Layout: what is chosen sits across the top, the arithmetic on the left, the
 * split on the right. Nothing is printed twice — the Project and the Plot are
 * named once, in the fields that chose them.
 */

import React from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PersonPicker } from "@/components/person-picker";
import { Field, inputClass } from "@/components/ui/modal";
import { calculateAreas } from "@/lib/domain/inventory";
import {
  generateCommission,
  noBenefitLabel,
  previewInput,
  resolveEligibility,
  type CommissionInput,
  type CommissionType,
  type PersonFacts,
} from "@/lib/domain/commission";
import {
  RATE_TYPE_LABEL,
  calculateRate,
  formatRupees,
  parsePercent,
  type RateType,
} from "@/lib/domain/rate-calculator";
import { formatQuantity, type StaffRole } from "@/lib/tasks";

export type CalcProjectView = {
  id: string;
  name: string;
  projectCode: string;
  city: string | null;
  location: string | null;
};

/** One sale-commission component, with the rate and milestone the engine gives it. */
export type CalcCommissionTypeView = {
  type: CommissionType;
  label: string;
  percent: string;
  milestonePercent: string;
  note: string;
};

/** A Person, with the facts that decide whether they can be paid (PRD §6, §14.7). */
export type CalcPersonView = {
  id: string;
  label: string;
  aadhaarAvailable: boolean;
  bankVerified: boolean;
  /** PRD §14.5 — a first personal purchase earns no repeat-purchase Loyalty. */
  hasPriorPurchase: boolean;
  member: {
    memberId: string;
    status: "ACTIVE" | "DEACTIVATED";
    reraStatus: "REGISTERED" | "PENDING" | "EXPIRED" | "NOT_APPLICABLE";
    commissionHold: boolean;
    invitedByPersonId: string | null;
    invitedBy: string | null;
    invitePosition: number | null;
    inviteRatePercent: string | null;
    inviteUsed: boolean;
  } | null;
  customer: {
    customerId: string;
    royaltyMemberPersonId: string | null;
    royaltyMember: string | null;
    royaltyPosition: number | null;
    royaltyRatePercent: string | null;
    royaltyUsed: boolean;
    loyaltyUsed: number;
  } | null;
};

/** One frozen CommissionRecord on the Plot's live Booking (PRD §6.9). */
export type CalcDealRecordView = {
  personId: string;
  personName: string;
  personRef: string | null;
  type: string;
  beneficiaryRole: string;
  percent: string;
  milestonePercent: string;
  eligibility: string;
  holdReason: string | null;
  payment: string;
  bookingRef: string;
  bookingStatus: string;
  soldBy: string;
  soldByType: string;
  soldByPersonId: string | null;
  buyerPersonId: string;
  paymentReceivedPercent: string;
};

export type CalcPlotView = {
  id: string;
  projectId: string;
  plotNumber: string;
  plotType: string;
  status: string;
  widthFt: string;
  lengthFt: string;
  /** Set on an irregular Plot; the area to charge against when it is. */
  exactAreaSqFt: string;
  exactAreaReason: string;
  storedAreaSqFt: string;
  plcPercent: string | null;
  plcVersion: number | null;
  plcComponents: Array<{ label: string; evidence: string }>;
  plcIssue: string | null;
  /** The commission this Plot already carries, where it has been sold. */
  deal: CalcDealRecordView[] | null;
};

type SoldByType = CommissionInput["soldByType"];

/**
 * A beneficiary line, and where it came from. The three origins are never
 * mixed up: a frozen record already has the engine's answer, an engine line is
 * this screen asking the engine the same question about a sale that does not
 * exist, and a hand-typed line is neither.
 */
type Split = {
  key: number;
  personId: string;
  type: CommissionType;
  percent: string;
  /** The Booking's own record, until the person or the component is changed. */
  record: CalcDealRecordView | null;
  /** What generateCommission() produced for this line, on the same terms. */
  derived: { beneficiaryRole: string; ruleVersion: string; milestonePercent: string } | null;
};

const humanise = (value: string) => value.replaceAll("_", " ").toLowerCase();

/** Areas carry four decimals and usually need none of them. */
const trim = (value: { toFixed(dp: number): string }) =>
  formatQuantity(value.toFixed(4).replace(/\.?0+$/, ""));

const SOLD_BY_LABEL: Record<SoldByType, string> = {
  THREE_PERCENT_CLUB: "3% Club — direct",
  MEMBER: "Member",
  CUSTOMER: "Customer",
};

/** PRD §14.8 — the controlled hold reasons, said in full rather than in code. */
const HOLD_SENTENCE: Record<string, string> = {
  AADHAAR_PENDING: "Aadhaar Pending — no Aadhaar recorded for this Person",
  BANK_VERIFICATION_PENDING: "Bank Verification Pending — no verified bank account on file",
  RERA_PENDING: "RERA Pending — a Member component needs Registered or Not Applicable",
  RERA_EXPIRED: "RERA Expired — a Member component needs Registered or Not Applicable",
  MEMBER_COMMISSION_HOLD: "Member Commission Hold — every unpaid record of this Member is held",
  MEMBER_DEACTIVATED: "Member Deactivated — unpaid commission is held until reactivation",
  REFUND_PENDING: "Refund Pending on the Booking",
  CHANGE_PLOT_PENDING: "Change Plot Pending on the Booking",
  BUYBACK_PENDING: "Buyback Pending on the Booking",
  PAYMENT_PENDING: "Payment Pending on the acquisition",
  COMMISSION_CONFLICT_ABOVE_4: "Commission Conflict — Above 4%",
};

export default function CalculatorClient({
  role,
  actorName,
  staffAccountId,
  projects,
  plots,
  people,
  commissionTypes,
  capPercent,
  maxLoyaltySlots,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  projects: CalcProjectView[];
  plots: CalcPlotView[];
  people: CalcPersonView[];
  commissionTypes: CalcCommissionTypeView[];
  capPercent: string;
  maxLoyaltySlots: number;
}) {
  const [projectId, setProjectId] = React.useState("");
  const [plotId, setPlotId] = React.useState("");
  // Typed over the Plot's own sides. A regular Plot opens on what is on file
  // and stays changeable — this is a quote, not an edit of the Plot.
  const [widthFt, setWidthFt] = React.useState("");
  const [lengthFt, setLengthFt] = React.useState("");
  const [rateType, setRateType] = React.useState<RateType>("SQ_FT");
  const [rate, setRate] = React.useState("");

  // The two parties the engine needs. Nothing else decides a commission
  // combination (PRD §6.5, main-PRD §25): the final Sold By selection controls
  // it, and the buyer carries the Loyalty and Royalty entitlements.
  const [soldByType, setSoldByType] = React.useState<SoldByType>("THREE_PERCENT_CLUB");
  const [soldByPersonId, setSoldByPersonId] = React.useState("");
  const [buyerPersonId, setBuyerPersonId] = React.useState("");
  const [conflict, setConflict] = React.useState<string | null>(null);

  const [splits, setSplits] = React.useState<Split[]>([]);
  const nextKey = React.useRef(0);

  const person = (id: string | null) => (id ? (people.find((p) => p.id === id) ?? null) : null);

  /** What the engine needs to know about one Person, from what was shipped. */
  const facts = (p: CalcPersonView | null): PersonFacts | null =>
    p && {
      id: p.id,
      memberActive: p.member?.status === "ACTIVE",
      hasPriorPurchase: p.hasPriorPurchase,
      invite:
        p.member?.invitedByPersonId && p.member.invitePosition && p.member.inviteRatePercent
          ? {
              beneficiaryPersonId: p.member.invitedByPersonId,
              position: p.member.invitePosition,
              ratePercent: p.member.inviteRatePercent,
            }
          : null,
      inviteUsed: p.member?.inviteUsed ?? false,
      royalty:
        p.customer?.royaltyMemberPersonId &&
        p.customer.royaltyPosition &&
        p.customer.royaltyRatePercent
          ? {
              beneficiaryPersonId: p.customer.royaltyMemberPersonId,
              position: p.customer.royaltyPosition,
              ratePercent: p.customer.royaltyRatePercent,
            }
          : null,
      royaltyUsed: p.customer?.royaltyUsed ?? false,
      loyaltyUsed: p.customer?.loyaltyUsed ?? 0,
    };
  const pickerOptions = React.useMemo(
    () => people.map((p) => ({ id: p.id, label: p.label })),
    [people]
  );
  const projectPlots = React.useMemo(
    () => (projectId ? plots.filter((p) => p.projectId === projectId) : []),
    [projectId, plots]
  );
  const plot = projectPlots.find((p) => p.id === plotId) ?? null;
  const deal = plot?.deal ?? null;

  /** The Booking's own lines, as the engine froze them. */
  function dealSplits(rows: CalcDealRecordView[]): Split[] {
    return rows.map((record) => ({
      key: nextKey.current++,
      personId: record.personId,
      type: record.type as CommissionType,
      percent: Number(record.percent).toString(),
      record,
      derived: null,
    }));
  }

  /**
   * The whole combination, from the engine, for a sale that does not exist.
   *
   * This is generateCommission() — the same function a Booking runs, called
   * with the live facts of the two people chosen: their frozen network
   * positions, their open or consumed entitlements, and whether the buyer
   * already owns a Plot. Nothing is invented and no position is typed. The
   * engine's refusals arrive here as they would on a Booking, including the 4%
   * ceiling, and are shown rather than worked around (RD-03).
   */
  function derive(type: SoldByType, sellerId: string, buyerId: string) {
    const keep = (rows: Split[]) => rows.filter((r) => !r.derived && !r.record);

    const buyer = facts(person(buyerId));
    const seller = type === "THREE_PERCENT_CLUB" ? null : facts(person(sellerId));
    if (!buyer || (type !== "THREE_PERCENT_CLUB" && !seller)) {
      setConflict(null);
      setSplits(keep);
      return;
    }

    let outcome;
    try {
      outcome = generateCommission(previewInput(type, seller, buyer));
    } catch (error) {
      // A frozen band that disagrees with the band table stops the engine on a
      // real Booking too; it is a network record to resolve, not a rounding.
      setConflict(error instanceof Error ? error.message : "The engine refused this combination.");
      setSplits(keep);
      return;
    }

    if (!outcome.ok) {
      setConflict(outcome.conflict);
      setSplits(keep);
      return;
    }

    setConflict(null);
    setSplits((rows) => [
      ...outcome.components.map((c) => ({
        key: nextKey.current++,
        personId: c.beneficiaryPersonId,
        type: c.type,
        percent: c.percent,
        record: null,
        derived: {
          beneficiaryRole: c.beneficiaryRole,
          ruleVersion: c.ruleVersion,
          milestonePercent: c.milestonePercent,
        },
      })),
      ...keep(rows),
    ]);
  }

  /** Changing the Project drops the Plot with it — the old one is not in the new list. */
  function chooseProject(id: string) {
    setProjectId(id);
    setPlotId("");
    setWidthFt("");
    setLengthFt("");
    setSplits([]);
    setConflict(null);
  }

  /** Changing the Plot reloads its sides, and its deal, over the last one's. */
  function choosePlot(id: string) {
    setPlotId(id);
    const next = projectPlots.find((p) => p.id === id) ?? null;
    setWidthFt(next?.widthFt ?? "");
    setLengthFt(next?.lengthFt ?? "");
    setConflict(null);
    // A sold Plot brings its own parties and its own frozen lines. An unsold
    // one brings nobody, and the panel is driven by the pickers instead.
    const record = next?.deal?.[0] ?? null;
    setSoldByType((record?.soldByType as SoldByType) ?? "THREE_PERCENT_CLUB");
    setSoldByPersonId(record?.soldByPersonId ?? "");
    setBuyerPersonId(record?.buyerPersonId ?? "");
    setSplits(next?.deal ? dealSplits(next.deal) : []);
  }

  function editSplit(key: number, patch: Partial<Split>) {
    setSplits((rows) =>
      rows.map((r) =>
        r.key === key
          ? {
              ...r,
              ...patch,
              // Change the beneficiary or the component and this is no longer
              // the engine's line — its answer stops describing it.
              ...(patch.personId !== undefined || patch.type !== undefined
                ? { record: null, derived: null }
                : {}),
            }
          : r
      )
    );
  }

  // An irregular Plot has an approved exact area and no sides to multiply.
  const irregular = Boolean(plot?.exactAreaSqFt);

  const areas = React.useMemo(() => {
    if (!plot) return null;
    try {
      return irregular
        ? calculateAreas({
            kind: "EXACT",
            exactAreaSqFt: plot.exactAreaSqFt,
            // The Plot carries the reason already; calculateAreas only checks
            // that one exists, and this is not the screen that sets it.
            reason: plot.exactAreaReason || "Exact area recorded on the Plot.",
          })
        : calculateAreas({ kind: "REGULAR", widthFt, lengthFt });
    } catch {
      // Blank or non-positive sides — the form says so below rather than here.
      return null;
    }
  }, [plot, irregular, widthFt, lengthFt]);

  const result = React.useMemo(() => {
    if (!areas) return null;
    return calculateRate({
      rateType,
      rate,
      areaSqFt: areas.areaSqFt,
      areaSqYd: areas.areaSqYd,
    });
  }, [areas, rateType, rate]);

  const total = result?.ok ? result.total : null;
  const zero = parsePercent("0")!;

  /** Each line's rate as typed, and its share of the figure on the left. */
  const shares = splits.map((split) => {
    const percent = parsePercent(split.percent);
    return {
      split,
      beneficiary: person(split.personId),
      percent,
      amount: percent && total ? total.mul(percent).div(100) : null,
    };
  });

  const totalPercent = shares.reduce((sum, s) => (s.percent ? sum.add(s.percent) : sum), zero);
  const totalShare = shares.reduce((sum, s) => (s.amount ? sum.add(s.amount) : sum), zero);
  // RD-03 — the ceiling is the engine's own constant, passed in, not restated.
  // A derived combination never gets here; the engine refuses it first.
  const overCap = totalPercent.gt(capPercent);

  /**
   * What the engine would say about the beneficiary of one line.
   *
   * The milestone is passed as reached, because there is no verified payment to
   * have reached it: the question is whether this Person could be paid at all —
   * Aadhaar, a verified bank, Member status, the Member hold and RERA (PRD
   * §14.7, §19.5). A line that came from a Booking is never sent through here;
   * it already carries the engine's frozen answer.
   */
  function preview(
    beneficiary: CalcPersonView,
    type: CommissionType,
    milestone: string,
    /** Null while the line has a beneficiary but no band yet. */
    percent: string | null
  ) {
    return resolveEligibility({
      type,
      // CR-013 — a 0% band answers No Benefit before any of the conditions
      // below are consulted, and the preview must say the same thing.
      percent,
      progressPercent: milestone,
      milestonePercent: milestone,
      beneficiaryAadhaarAvailable: beneficiary.aadhaarAvailable,
      beneficiaryBankVerified: beneficiary.bankVerified,
      memberStatus: beneficiary.member?.status ?? null,
      memberCommissionHold: beneficiary.member?.commissionHold ?? false,
      reraStatus: beneficiary.member?.reraStatus ?? null,
      bookingProcess: "NONE",
      acquisitionPaymentPending: false,
      commissionConflictAbove4: overCap,
      // AC-02 — treated as complete for the same reason the milestone is treated
      // as reached: a performance cycle is a fact about a real transaction, and
      // the Calculator is asking about the Person before there is one.
    });
  }

  /**
   * The entitlement rules that are about this Person rather than about the
   * sale. A hand-added line has no Sold By and no buyer behind it, so Invite
   * and Royalty are not judged here — those opportunities belong to the invited
   * Member and the introduced Customer (PRD §6.1, §6.3). Choose the two parties
   * above and the engine judges the whole combination properly.
   */
  function ruleNotes(beneficiary: CalcPersonView, type: CommissionType): string[] {
    const notes: string[] = [];
    if (type !== "LOYALTY" && !beneficiary.member) {
      notes.push("Not a Member on file — Direct, Invite and Royalty are Member components.");
    }
    if (type === "LOYALTY") {
      if (!beneficiary.customer) {
        notes.push("Not a Customer on file — the Loyalty Bonus is a Customer benefit (PRD §6.5).");
      }
      if (beneficiary.member?.status === "ACTIVE") {
        notes.push(
          "Holds an Active Member capability, so a closing action uses Sold By Member and earns " +
            "no Customer Loyalty (PRD §6.7)."
        );
      }
      if ((beneficiary.customer?.loyaltyUsed ?? 0) >= maxLoyaltySlots) {
        notes.push(
          `All ${maxLoyaltySlots} lifetime Loyalty slots are consumed, and the limit never resets ` +
            "(PRD §6.5)."
        );
      }
    }
    return notes;
  }

  /** Whether the engine had both parties and actually answered. */
  const engineRan =
    Boolean(person(buyerPersonId)) &&
    (soldByType === "THREE_PERCENT_CLUB" || Boolean(person(soldByPersonId)));

  /** What is still missing, in the order the form asks for it. */
  const blocker = !projectId
    ? "Select a Project."
    : !plotId
      ? "Select a Plot."
      : !areas
        ? irregular
          ? "This Plot has no usable exact area."
          : "Enter a Width and a Length greater than zero."
        : rate.trim() === ""
          ? "Enter a Rate."
          : result && !result.ok
            ? result.reason
            : null;

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-xl font-semibold">Plot Rate &amp; Area Calculator</h1>

        {/* Everything chosen sits on one row. Nothing below repeats it. */}
        <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Project">
            <select
              className={inputClass}
              value={projectId}
              onChange={(e) => chooseProject(e.target.value)}
            >
              <option value="">Select a Project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.city ? ` — ${p.city}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Plot">
            <select
              className={inputClass}
              value={plotId}
              disabled={!projectId}
              onChange={(e) => choosePlot(e.target.value)}
            >
              <option value="">
                {projectId
                  ? projectPlots.length === 0
                    ? "No Plots in this Project"
                    : "Select a Plot…"
                  : "Select a Project first"}
              </option>
              {projectPlots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plotNumber} · {humanise(p.plotType)}
                  {p.deal ? " · sold" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Rate Type">
            <select
              className={inputClass}
              value={rateType}
              onChange={(e) => setRateType(e.target.value as RateType)}
            >
              <option value="SQ_FT">{RATE_TYPE_LABEL.SQ_FT}</option>
              <option value="SQ_YD">{RATE_TYPE_LABEL.SQ_YD}</option>
            </select>
          </Field>

          <Field label={`Rate (₹ ${rateType === "SQ_FT" ? "per Sq. Ft." : "per Sq. Yd."})`}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              placeholder="2000"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ------------------------------------------------ left: the figure */}
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Calculation
              </h2>
              {plot && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{humanise(plot.status)}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {plot.plcPercent
                      ? `PLC ${Number(plot.plcPercent).toFixed(2)}%${
                          plot.plcVersion !== null ? ` · v${plot.plcVersion}` : ""
                        }`
                      : (plot.plcIssue ?? "")}
                  </span>
                </div>
              )}
            </div>

            {!plot ? (
              <p className="rounded-xl border border-border/60 bg-secondary p-3 text-xs text-muted-foreground">
                {blocker}
              </p>
            ) : (
              <>
                {irregular ? (
                  <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
                    <p className="font-semibold text-foreground">
                      Calculated on the Exact Area Override
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      This Plot is irregular: it carries an exact area of{" "}
                      {formatQuantity(plot.exactAreaSqFt)} Sq. Ft. instead of sides, and the rate is
                      applied to that. The stored Width and Length are not changed.
                      {plot.exactAreaReason ? ` Reason on file: ${plot.exactAreaReason}` : ""}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Width / Front (ft)">
                      <Input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        inputMode="decimal"
                        value={widthFt}
                        onChange={(e) => setWidthFt(e.target.value)}
                      />
                    </Field>
                    <Field label="Length / Depth (ft)">
                      <Input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        inputMode="decimal"
                        value={lengthFt}
                        onChange={(e) => setLengthFt(e.target.value)}
                      />
                    </Field>
                  </div>
                )}

                {/* Read-only by construction: these are outputs of the area
                    rule, not fields, so there is nothing here to type into. */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["Area in Sq. Ft.", areas?.areaSqFt],
                      ["Area in Sq. Yd.", areas?.areaSqYd],
                      ["Area in Sq. M.", areas?.areaSqM],
                    ] as const
                  ).map(([label, value]) => (
                    <Field key={label} label={label}>
                      <p className={`${inputClass} flex items-center font-semibold tabular-nums`}>
                        {value ? trim(value) : "—"}
                      </p>
                    </Field>
                  ))}
                </div>

                {/* A percentage and nothing else. The CRM holds no rupee value
                    to apply it against, so it is shown for context and is not
                    folded into the total below (PRD §16.3). */}
                {plot.plcComponents.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {plot.plcComponents.map((c) => `${c.label} (${c.evidence})`).join(" · ")} — a
                    percentage only; it is not applied to the figure below.
                  </p>
                )}

                {blocker ? (
                  <p className="rounded-xl border border-border/60 bg-secondary p-3 text-xs text-muted-foreground">
                    {blocker}
                  </p>
                ) : (
                  result?.ok && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Calculated Total
                      </p>
                      <p className="text-2xl font-semibold tabular-nums text-primary">
                        {formatRupees(result.total)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {trim(result.areaUsed)} {result.unit} × {formatRupees(rate)}{" "}
                        {RATE_TYPE_LABEL[rateType].toLowerCase()}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        A working figure only. It is not stored, not a Booking value, and no Payment
                        Received or Payment Given percentage is derived from it.
                      </p>
                    </div>
                  )
                )}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    // Back to the Plot as it stands: its own sides, its own
                    // parties, its own lines, and no rate.
                    onClick={() => {
                      setRate("");
                      setRateType("SQ_FT");
                      choosePlot(plot.id);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </>
            )}
          </Card>

          {/* -------------------------------------------- right: who earns what

              Three ways in, and they never mix. A sold Plot arrives with its
              Booking's own frozen records. Naming the two parties runs the
              engine over a sale that does not exist yet, which is the whole
              point of asking before a Booking. Anything else is typed by hand.
              Nothing here writes a CommissionRecord, consumes a slot or moves a
              counter position (PRD §6.8, §6.9). */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Commission
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSplits((rows) => [
                    ...rows,
                    {
                      key: nextKey.current++,
                      personId: "",
                      type: commissionTypes[0].type,
                      percent: commissionTypes[0].percent,
                      record: null,
                      derived: null,
                    },
                  ])
                }
              >
                + Add beneficiary
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Sold By">
                <select
                  className={inputClass}
                  value={soldByType}
                  onChange={(e) => {
                    const next = e.target.value as SoldByType;
                    setSoldByType(next);
                    // A 3% Club close names nobody, so the picker goes with it.
                    const seller = next === "THREE_PERCENT_CLUB" ? "" : soldByPersonId;
                    setSoldByPersonId(seller);
                    derive(next, seller, buyerPersonId);
                  }}
                >
                  {(Object.keys(SOLD_BY_LABEL) as SoldByType[]).map((t) => (
                    <option key={t} value={t}>
                      {SOLD_BY_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={soldByType === "CUSTOMER" ? "Sold By Customer" : "Sold By Member"}
              >
                <PersonPicker
                  options={pickerOptions}
                  value={soldByPersonId}
                  disabled={soldByType === "THREE_PERCENT_CLUB"}
                  placeholder={
                    soldByType === "THREE_PERCENT_CLUB" ? "Nobody — a direct close" : "Search…"
                  }
                  onChange={(id) => {
                    setSoldByPersonId(id);
                    derive(soldByType, id, buyerPersonId);
                  }}
                />
              </Field>

              <Field label="Buyer — Primary Customer">
                <PersonPicker
                  options={pickerOptions}
                  value={buyerPersonId}
                  placeholder="Search…"
                  onChange={(id) => {
                    setBuyerPersonId(id);
                    derive(soldByType, soldByPersonId, id);
                  }}
                />
              </Field>
            </div>

            {conflict && (
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {conflict}
              </p>
            )}

            {deal && splits.some((s) => s.record) && (
              <p className="rounded-xl border border-border/60 bg-secondary p-3 text-[11px] text-muted-foreground">
                Filled in from this Plot&apos;s Booking{" "}
                <span className="font-semibold text-foreground">{deal[0].bookingRef}</span> —{" "}
                {humanise(deal[0].bookingStatus)},{" "}
                {Number(deal[0].paymentReceivedPercent).toFixed(2)}% Payment Received. The
                percentages and states below are the Booking&apos;s own records; only the rupee
                figures are this screen&apos;s arithmetic. Change a party above to ask the engine a
                different question instead.
              </p>
            )}

            {/* An empty panel with the fields above it explains itself. The
                engine's own silence does not: it answered, and the answer was
                nothing, which is worth saying. */}
            {splits.length === 0 && !conflict && engineRan && (
              <p className="rounded-xl border border-border/60 bg-secondary p-3 text-xs text-muted-foreground">
                The engine generates no commission line for this combination — a first direct 3%
                Club purchase earns nothing (main-PRD §14.5).
              </p>
            )}

            {shares.map(({ split, beneficiary, percent, amount }) => {
              const kind = commissionTypes.find((c) => c.type === split.type);
              const { record, derived } = split;
              const milestone = derived?.milestonePercent ?? kind?.milestonePercent ?? "100";
              const verdict =
                beneficiary && !record
                  ? preview(beneficiary, split.type, milestone, percent?.toString() ?? null)
                  : null;
              const notes = beneficiary && !record && !derived ? ruleNotes(beneficiary, split.type) : [];

              return (
                <div key={split.key} className="space-y-2 rounded-xl border border-border/60 p-3">
                  <div className="flex items-start gap-2">
                    <PersonPicker
                      className="flex-1"
                      options={pickerOptions}
                      value={split.personId}
                      onChange={(id) => editSplit(split.key, { personId: id })}
                      placeholder="Search name, mobile, Customer ID or Member ID"
                    />
                    <button
                      type="button"
                      aria-label="Remove this beneficiary"
                      className="h-9 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSplits((rows) => rows.filter((r) => r.key !== split.key))}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_6.5rem]">
                    <select
                      className={inputClass}
                      value={split.type}
                      onChange={(e) => {
                        // The rate follows the type it belongs to and stays
                        // editable — an Invite or Royalty band depends on a
                        // network position a hand-added line cannot read.
                        const next = commissionTypes.find((c) => c.type === e.target.value);
                        editSplit(split.key, {
                          type: e.target.value as CommissionType,
                          percent: next?.percent ?? split.percent,
                        });
                      }}
                    >
                      {commissionTypes.map((c) => (
                        <option key={c.type} value={c.type}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        inputMode="decimal"
                        aria-label="Percentage"
                        value={split.percent}
                        onChange={(e) => editSplit(split.key, { percent: e.target.value })}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">
                      {derived
                        ? `${humanise(derived.beneficiaryRole)} · ${derived.ruleVersion}`
                        : kind?.note}
                      {` · payable at ${milestone}% Payment Received`}
                    </p>
                    <p className="whitespace-nowrap text-sm font-semibold tabular-nums">
                      {amount ? formatRupees(amount) : percent ? "—" : "Percentage?"}
                    </p>
                  </div>

                  {/* The Booking's own answer, where this line came from one. */}
                  {record && (
                    <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold capitalize text-foreground">
                        {record.eligibility === "NO_BENEFIT"
                          ? noBenefitLabel(record.type as "INVITE" | "ROYALTY")
                          : humanise(record.eligibility)}
                      </span>
                      {record.holdReason
                        ? ` — ${HOLD_SENTENCE[record.holdReason] ?? humanise(record.holdReason)}`
                        : ""}{" "}
                      · payment {humanise(record.payment)} · as the{" "}
                      {humanise(record.beneficiaryRole)}
                    </p>
                  )}

                  {/* Otherwise the engine's verdict on the beneficiary, and the
                      entitlement facts behind it. */}
                  {beneficiary && !record && (
                    <div className="space-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                      <p>
                        <span
                          className={`font-semibold ${
                            verdict?.state === "READY" ? "text-foreground" : "text-destructive"
                          }`}
                        >
                          {verdict?.state === "READY"
                            ? "Payable at the milestone"
                            : `On hold — ${
                                verdict?.holdReason
                                  ? (HOLD_SENTENCE[verdict.holdReason] ??
                                    humanise(verdict.holdReason))
                                  : ""
                              }`}
                        </span>{" "}
                        · Aadhaar {beneficiary.aadhaarAvailable ? "available" : "pending"} · bank{" "}
                        {beneficiary.bankVerified ? "verified" : "not verified"}
                      </p>

                      {beneficiary.member && (
                        <p>
                          {beneficiary.member.memberId} · {humanise(beneficiary.member.status)} ·
                          RERA {humanise(beneficiary.member.reraStatus)}
                          {beneficiary.member.commissionHold ? " · commission hold" : ""}
                          {beneficiary.member.invitedBy
                            ? ` · invited by ${beneficiary.member.invitedBy}, position ${
                                beneficiary.member.invitePosition ?? "—"
                              } → ${beneficiary.member.inviteRatePercent ?? "—"}%`
                            : " · no inviting Member"}
                          {` · Invite opportunity ${
                            beneficiary.member.inviteUsed ? "consumed" : "open"
                          }`}
                        </p>
                      )}

                      {beneficiary.customer && (
                        <p>
                          {beneficiary.customer.customerId} · Loyalty{" "}
                          {beneficiary.customer.loyaltyUsed} of {maxLoyaltySlots} used · Royalty{" "}
                          {beneficiary.customer.royaltyUsed ? "consumed" : "open"}
                          {beneficiary.customer.royaltyMember
                            ? ` · Royalty linked to ${beneficiary.customer.royaltyMember}, position ${
                                beneficiary.customer.royaltyPosition ?? "—"
                              } → ${beneficiary.customer.royaltyRatePercent ?? "—"}%`
                            : " · no Royalty Linked Member"}
                        </p>
                      )}

                      {notes.map((note) => (
                        <p key={note} className="text-destructive">
                          {note}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {splits.length > 0 && (
              <>
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Total {totalPercent.toFixed(2)}%</span>
                  <span className="tabular-nums">{total ? formatRupees(totalShare) : "—"}</span>
                </div>

                {overCap && (
                  <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    Above the {capPercent}% combined sale-commission cap (RD-03). A real Booking
                    would be refused this combination until Sold By or a beneficiary is corrected —
                    no component is ever trimmed to fit.
                  </p>
                )}

                <p className="text-[11px] text-muted-foreground">
                  An estimate that binds nobody. Commission is earned by verified payment on a real
                  Booking, and no figure here is stored, owed or paid.
                </p>
              </>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
