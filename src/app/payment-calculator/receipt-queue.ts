import { parseRupees, receiptTrackingId, TOTAL_UNITS, toUnits } from "../../lib/domain/payment-percent.ts";
import { worksheetPoints } from "../../lib/domain/worksheet-formula.ts";
import { istDay } from "../../lib/tasks.ts";
import type { CalculatorBookingView } from "./actions";

export type ReceiptDraft = {
  id: number;
  projectId: string;
  bookingId: string;
  amount: string;
  date: string;
  reference: string;
  claimId: string;
  plotValue: string;
  recordedPoints: string;
  message: string;
  saved: boolean;
};

export function emptyReceipt(id: number, projectId: string, bookingId = ""): ReceiptDraft {
  return { id, projectId, bookingId, amount: "", date: istDay(new Date()), reference: "", claimId: "",
    plotValue: "", recordedPoints: "", message: "", saved: false };
}

function pointUnits(points: string) {
  const [whole, fraction = ""] = points.split(".");
  return BigInt(whole + fraction.padEnd(4, "0"));
}

export function pointsForAmount(amount: string, formula: string | null) {
  if ("error" in parseRupees(amount) || formula === "") return null;
  const value = amount.replace(/,/g, "");
  return worksheetPoints(formula ?? "=AMOUNT", { AMOUNT: value, TOTAL: value, RECEIVED: value }, "AMOUNT");
}

export function prepareReceipts(drafts: ReceiptDraft[], views: Record<string, CalculatorBookingView>, formula: string | null) {
  const projected = new Map<string, bigint>();
  const seen = new Set<string>();
  return drafts.map((draft) => {
    const view = views[draft.bookingId];
    const received = projected.get(draft.bookingId) ?? toUnits(view?.received ?? "0");
    const available = TOTAL_UNITS - received;
    const points = draft.saved ? draft.recordedPoints : pointsForAmount(draft.amount, formula) ?? "";
    let units = 0n;
    let error = "";
    if (view && !draft.saved) {
      if (view.status !== "BOOKED") error = view.status === "PAYMENT_COMPLETED" ? "This booking is fully paid." : "This booking cannot accept payments.";
      else if (view.activeProcess !== "NONE") error = "Complete the open booking change first.";
      else if (!view.instalments.length) error = "Set up an instalment schedule on the booking first.";
      else if (draft.amount) {
        if (!points) error = formula === "" ? "Enter the S.F. above." : "Check the amount and S.F.";
        if (points && view.tokens) {
          const basis = pointUnits(view.tokens);
          const numerator = pointUnits(points) * TOTAL_UNITS;
          units = numerator / basis;
          if (numerator > available * basis) error = "The payment exceeds the balance left.";
          else if (!units) error = "The payment is too small to record.";
        }
        const ref = draft.bookingId + ":" + draft.reference.trim().toLowerCase();
        if (!error) {
          if (!receiptTrackingId(draft.reference.trim())) error = "Enter a valid receipt tracking ID.";
          else if (seen.has(ref)) error = "This receipt is already in another row.";
          else if (!draft.date || draft.date > istDay(new Date())) error = "Choose today or an earlier receipt date.";
          else if (draft.claimId && !view.claims.some((c) => c.id === draft.claimId)) error = "This staff claim is no longer pending.";
        }
        if (!error && units > 0n) seen.add(ref);
      }
    }
    const ready = !!view && !error && units > 0n;
    if (ready) projected.set(draft.bookingId, received + units);
    return { draft, view, error, ready, units, points };
  });
}
