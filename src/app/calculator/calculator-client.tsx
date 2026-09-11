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
import { cn } from "@/lib/utils";
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
  DISCOUNT_MODE_LABEL,
  RATE_TYPE_LABEL,
  buildQuote,
  calculateRate,
  formatRupees,
  parsePercent,
  rupeesInWords,
  type DiscountMode,
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
  name: string;
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
  /** Where the Plot sits — NORTH FACING, PARK FACING, and so on. */
  locationCharge: string[];
  plcPercent: string | null;
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

/** NORTH-EAST CORNER is printed as North-East Corner: a place, not a shout. */
const titleWords = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join("-")
    )
    .join(" ");

/** A stored side is "25.0000" and is read as 25. */
const sides = (value: string) => formatQuantity(value.replace(/\.?0+$/, ""));

/**
 * One fact about the chosen Plot: the label asks, the value answers, and what
 * qualifies the answer sits under it in the same column — the evidence behind
 * a PLC component, or the reason there is no PLC at all.
 */
function CalcRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/40 py-1 last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="block font-semibold text-foreground">{value}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

/** One worksheet line: what it is, per unit, and in total. */
function WorkRow({
  label,
  rate,
  total,
  strong,
}: {
  label: string;
  rate: string;
  total: string;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? "font-semibold text-foreground" : ""}>
      <td className={strong ? "py-0.5" : "py-0.5 text-muted-foreground"}>{label}</td>
      <td className="py-0.5 text-right">{rate}</td>
      <td className="py-0.5 text-right">{total}</td>
    </tr>
  );
}

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
  initialPlotId,
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
  /** From ?plot= on a Plot's own page: the calculator opens on that Plot. */
  initialPlotId?: string | null;
}) {
  const [projectId, setProjectId] = React.useState("");
  const [plotId, setPlotId] = React.useState("");
  // Typed over the Plot's own sides. A regular Plot opens on what is on file
  // and stays changeable — this is a quote, not an edit of the Plot.
  const [rateType, setRateType] = React.useState<RateType>("SQ_FT");
  const [discount, setDiscount] = React.useState("");
  const [discountMode, setDiscountMode] = React.useState<DiscountMode>("PERCENT");
  const [rate, setRate] = React.useState("");

  // The two parties the engine needs. Nothing else decides a commission
  // combination (PRD §6.5, prd-complete §25): the final Sold By selection controls
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

  /**
   * Sold By Member lists Members and Sold By Customer lists Customers. One list
   * of everybody meant a Customer could be picked as the Member who sold, which
   * is not a thing that can happen — the engine would refuse it, and only after
   * the whole line had been filled in.
   *
   * The Buyer keeps the full list on purpose: someone buying their first Plot
   * is not a Customer yet, and a Member buying for themselves is exactly the
   * case this screen is opened to preview.
   */
  const soldByOptions = React.useMemo(() => {
    if (soldByType === "MEMBER") {
      return people.filter((p) => p.member).map((p) => ({ id: p.id, label: p.label }));
    }
    if (soldByType === "CUSTOMER") {
      return people.filter((p) => p.customer).map((p) => ({ id: p.id, label: p.label }));
    }
    return [];
  }, [people, soldByType]);
  /** A Member buying for themselves — the case the engine refuses a stranger on. */
  const buyerIsMember = Boolean(
    people.find((p) => p.id === buyerPersonId)?.member?.status === "ACTIVE"
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
    setSplits([]);
    setConflict(null);
  }

  /** Changing the Plot reloads its sides, and its deal, over the last one's. */
  function choosePlot(id: string) {
    applyPlot(id, projectPlots.find((p) => p.id === id) ?? null);
  }

  function applyPlot(id: string, next: CalcPlotView | null) {
    setPlotId(id);
    setConflict(null);
    // A sold Plot brings its own parties and its own frozen lines. An unsold
    // one brings nobody, and the panel is driven by the pickers instead.
    const record = next?.deal?.[0] ?? null;
    setSoldByType((record?.soldByType as SoldByType) ?? "THREE_PERCENT_CLUB");
    setSoldByPersonId(record?.soldByPersonId ?? "");
    setBuyerPersonId(record?.buyerPersonId ?? "");
    setSplits(next?.deal ? dealSplits(next.deal) : []);
  }

  // Opened from a Plot's own page: that Plot, in its Project, with its deal —
  // exactly what picking it by hand would load.
  React.useEffect(() => {
    const initial = plots.find((p) => p.id === initialPlotId);
    if (!initial) return;
    setProjectId(initial.projectId);
    applyPlot(initial.id, initial);
    // Once, on arrival. A later choice in the pickers is the user's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        : calculateAreas({ kind: "REGULAR", widthFt: plot.widthFt, lengthFt: plot.lengthFt });
    } catch {
      // Blank or non-positive sides — the form says so below rather than here.
      return null;
    }
  }, [plot, irregular]);

  const result = React.useMemo(() => {
    if (!areas) return null;
    return calculateRate({
      rateType,
      rate,
      areaSqFt: areas.areaSqFt,
      areaSqYd: areas.areaSqYd,
    });
  }, [areas, rateType, rate]);

  /**
   * CR-017 — (Base + Applicable PLC) − Authorised Discount, which is the figure
   * every commission is a share of (approved-changes-pack §18). Nothing is
   * stored: this is the worksheet Accounts keeps outside the CRM, run here so a
   * quote can be given while the buyer is still in the room.
   */
  const quote = result?.ok
    ? buildQuote({
        base: result.total,
        areaUsed: result.areaUsed,
        plcPercent: plot?.plcPercent ?? null,
        discountMode,
        discount,
      })
    : null;

  const total = quote?.commissionable ?? null;
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
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Plot Rate &amp; Area Calculator</h1>
          {plot && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              // Back to the Plot as it stands: its own parties, its own
              // lines, no rate and no discount.
              onClick={() => {
                setRate("");
                setRateType("SQ_FT");
                setDiscount("");
                setDiscountMode("PERCENT");
                choosePlot(plot.id);
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Everything chosen sits on one row. Nothing below repeats it. */}
        <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
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

          {/* A discount is given three ways on a plot, and which one it is
              changes the arithmetic, not just the wording: a share of the
              figure, a sum off it, or a cut in the rate itself. The number and
              the way it is meant sit in one field, because either alone says
              nothing. */}
          <Field label="Discount">
            <div className="flex gap-1.5">
              <Input
                className="min-w-0 flex-1"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                aria-label="Discount"
              />
              {/* Two states, both on screen: a discount is either a share or
                  a sum, and which one it is has to be readable without opening
                  anything. */}
              <div className="flex shrink-0 rounded-lg border border-input bg-card p-0.5">
                {(["PERCENT", "AMOUNT"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDiscountMode(mode)}
                    aria-pressed={discountMode === mode}
                    className={`w-9 rounded-md py-1 text-xs transition-colors ${
                      discountMode === mode
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {DISCOUNT_MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            </div>
          </Field>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* ------------------------------------------------ left: the figure */}
          <Card className="space-y-2 p-3">

            {!plot ? (
              <p className="rounded-xl border border-border/60 bg-secondary p-3 text-xs text-muted-foreground">
                {blocker}
              </p>
            ) : (
              <>
                {/* The Plot as it stands, two facts to a row so the whole
                    screen fits a 1366×768 laptop without scrolling. Location
                    is a sentence, so it gets the full width. */}
                <dl className="grid grid-cols-2 gap-x-6 text-xs">
                  <CalcRow
                    label="Status"
                    value={<Badge variant="outline">{humanise(plot.status)}</Badge>}
                  />
                  <CalcRow
                    label="PLC"
                    value={plot.plcPercent ? `${Number(plot.plcPercent).toFixed(2)}%` : "—"}
                    // Only the reason there is no percentage.
                    hint={plot.plcPercent ? undefined : (plot.plcIssue ?? undefined)}
                  />
                  <CalcRow
                    label="Size (W × L)"
                    value={
                      irregular ? "Irregular" : `${sides(plot.widthFt)} × ${sides(plot.lengthFt)} ft`
                    }
                    // An irregular Plot is priced on the exact area its own
                    // page set under a reason; the Area row shows that figure.
                    hint={
                      irregular
                        ? `Exact area used${plot.exactAreaReason ? ` — ${plot.exactAreaReason}` : ""}`
                        : undefined
                    }
                  />
                  <CalcRow
                    label="Area"
                    value={
                      areas
                        ? `${trim(areas.areaSqFt)} sq ft · ${trim(areas.areaSqYd)} sq yd`
                        : "—"
                    }
                  />
                  <div className="col-span-2">
                    <CalcRow
                      label="Location"
                      value={
                        plot.locationCharge.length
                          ? plot.locationCharge.map(titleWords).join(" · ")
                          : "None"
                      }
                    />
                  </div>
                </dl>

                {blocker ? (
                  <p className="rounded-xl border border-border/60 bg-secondary p-3 text-xs text-muted-foreground">
                    {blocker}
                  </p>
                ) : (
                  result?.ok &&
                  quote?.rates && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                      {/* The worksheet, rate and total side by side, so every
                          line reads straight across: Base + PLC − Discount. A
                          figure nobody can check is a figure nobody quotes from. */}
                      <table className="w-full text-[11px] tabular-nums">
                        <thead className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="pb-1 text-left font-medium">
                              {trim(result.areaUsed)} {result.unit}
                            </th>
                            <th className="pb-1 text-right font-medium">Per {result.unit}</th>
                            <th className="pb-1 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          <WorkRow
                            label="Base"
                            rate={formatRupees(quote.rates.base)}
                            total={formatRupees(quote.base)}
                          />
                          {plot.plcPercent && (
                            <WorkRow
                              label={`PLC ${Number(plot.plcPercent).toFixed(2)}%`}
                              rate={`+ ${formatRupees(quote.rates.plc)}`}
                              total={`+ ${formatRupees(quote.plc)}`}
                            />
                          )}
                          {quote.discount.gt(0) && (
                            <WorkRow
                              label={`Discount${
                                discountMode === "PERCENT" ? ` ${discount.trim()}%` : ""
                              }`}
                              rate={`− ${formatRupees(quote.rates.discount)}`}
                              total={`− ${formatRupees(quote.discount)}`}
                            />
                          )}
                          <WorkRow
                            label="Final"
                            rate={formatRupees(quote.rates.final)}
                            total={formatRupees(quote.commissionable)}
                            strong
                          />
                        </tbody>
                      </table>

                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-primary/20 pt-1.5">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Amount
                        </span>
                        <span className="text-xl font-semibold tabular-nums text-primary">
                          {formatRupees(quote.commissionable)}
                        </span>
                      </div>
                      {/* The figure in words, the way a receipt writes it. */}
                      <p className="text-right text-[12.6px] font-medium text-foreground">
                        {rupeesInWords(quote.commissionable)}
                      </p>
                    </div>
                  )
                )}
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
          <Card className="space-y-2 p-3">

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Sold By">
                <select
                  className={inputClass}
                  value={soldByType}
                  onChange={(e) => {
                    const next = e.target.value as SoldByType;
                    setSoldByType(next);
                    // A 3% Club close names nobody, and a Member already picked
                    // is not a Customer — so anyone chosen under the old type
                    // goes with the type, rather than staying behind as a name
                    // the new list does not even contain.
                    const kept =
                      next === "MEMBER"
                        ? people.find((p) => p.id === soldByPersonId)?.member
                        : next === "CUSTOMER"
                          ? people.find((p) => p.id === soldByPersonId)?.customer
                          : null;
                    const seller = kept ? soldByPersonId : "";
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

              {/* A 3% Club close names nobody, so the field that would ask who
                  is not here at all — a disabled box saying "nobody" is still a
                  box to read past. */}
              {soldByType !== "THREE_PERCENT_CLUB" && (
                <Field label={soldByType === "CUSTOMER" ? "Sold By Customer" : "Sold By Member"}>
                  <PersonPicker
                    options={soldByOptions}
                    value={soldByPersonId}
                    placeholder={
                      soldByType === "MEMBER" ? "Search Members…" : "Search Customers…"
                    }
                    onChange={(id) => {
                      setSoldByPersonId(id);
                      derive(soldByType, id, buyerPersonId);
                    }}
                  />
                </Field>
              )}

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
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <p>{conflict}</p>
                {/* A Member buying for themselves is the one conflict this
                    screen can settle on its own: the rule names who Sold By
                    has to be, so the button sets it rather than leaving the
                    reader to work back to the two fields above. */}
                {buyerIsMember && soldByPersonId !== buyerPersonId && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      setSoldByType("MEMBER");
                      setSoldByPersonId(buyerPersonId);
                      derive("MEMBER", buyerPersonId, buyerPersonId);
                    }}
                  >
                    Set Sold By to this Member
                  </Button>
                )}
              </div>
            )}

            {/* An empty panel with the fields above it explains itself. The
                engine's own silence does not: it answered, and the answer was
                nothing, which is worth saying. */}
            {splits.length === 0 && !conflict && engineRan && (
              <p className="rounded-xl border border-border/60 bg-secondary p-3 text-xs text-muted-foreground">
                The engine generates no commission line for this combination — a first direct 3%
                Club purchase earns nothing (prd-complete §14.5).
              </p>
            )}

            {/* All four commissions, always, in the order the pack lists
                them — Direct, Invite, Royalty, Loyalty. A combination that
                earns none of one still shows its row, reading N/A, because
                "this deal pays no Royalty" is an answer somebody came here for
                and a missing row is not one. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-xs">
                <thead className="border-b border-border/60 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="pb-1.5 font-medium">Commission</th>
                    <th className="w-[5rem] pb-1.5 text-right font-medium">%</th>
                    <th className="w-[7.5rem] pb-1.5 text-right font-medium">Amount</th>
                    <th className="w-[8rem] pb-1.5 pl-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {commissionTypes.map((kind) => {
                    const line = shares.find(({ split }) => split.type === kind.type) ?? null;
                    const beneficiary = line?.beneficiary ?? null;
                    const record = line?.split.record ?? null;
                    const derived = line?.split.derived ?? null;
                    const percent = line?.percent ?? null;
                    const amount = line?.amount ?? null;
                    const milestone =
                      derived?.milestonePercent ?? kind.milestonePercent ?? "100";
                    const verdict =
                      beneficiary && !record
                        ? preview(beneficiary, kind.type, milestone, percent?.toString() ?? null)
                        : null;

                    // Not applicable is a real answer and is printed as one.
                    const status = !line
                      ? "N/A"
                      : record
                        ? record.eligibility === "NO_BENEFIT"
                          ? noBenefitLabel(record.type as "INVITE" | "ROYALTY")
                          : humanise(record.eligibility)
                        : !beneficiary
                          ? "N/A"
                          : verdict?.state === "READY"
                            ? "Ready"
                            : verdict?.state === "NO_BENEFIT"
                              ? noBenefitLabel(kind.type as "INVITE" | "ROYALTY")
                              : "On hold";

                    const why = record
                      ? [
                          record.holdReason
                            ? (HOLD_SENTENCE[record.holdReason] ?? humanise(record.holdReason))
                            : null,
                          `payment ${humanise(record.payment)}`,
                          `as the ${humanise(record.beneficiaryRole)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : beneficiary
                        ? [
                            verdict?.holdReason
                              ? (HOLD_SENTENCE[verdict.holdReason] ??
                                humanise(verdict.holdReason))
                              : null,
                            `Aadhaar ${beneficiary.aadhaarAvailable ? "available" : "pending"}`,
                            `bank ${beneficiary.bankVerified ? "verified" : "not verified"}`,
                            `payable at ${milestone}% Payment Received`,
                            ...ruleNotes(beneficiary, kind.type),
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : kind.note;

                    const held = status !== "Ready" && status !== "N/A" && !record;

                    return (
                      <tr key={kind.type} className="align-top">
                        <td className="py-1.5 pr-2">
                          <span className="block font-semibold text-foreground">{kind.label}</span>
                          {beneficiary && (
                            <span className="block text-[11px] text-muted-foreground">
                              {[
                                kind.type === "LOYALTY"
                                  ? (beneficiary.customer?.customerId ?? beneficiary.member?.memberId)
                                  : (beneficiary.member?.memberId ?? beneficiary.customer?.customerId),
                                beneficiary.name,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-medium tabular-nums">
                          {percent ? `${percent.toFixed(2)}%` : "N/A"}
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right font-semibold tabular-nums">
                          {amount ? formatRupees(amount) : "N/A"}
                        </td>
                        <td className="py-1.5 pl-4">
                          <span
                            className={held ? "text-destructive" : "text-muted-foreground"}
                            title={why}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
              </>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
