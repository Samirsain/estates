"use client";

// Confirm Payment Received from the Customer profile. DESIGN §11.1 — the same
// four fields and the same server action Plot Inventory and Bookings use, so a
// payment recorded here is exactly the payment recorded there. A Customer can
// be paying on more than one Booking, so the form asks which one first.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { istDay, remainingPercent } from "@/lib/tasks";
import { confirmPaymentReceivedAction } from "@/app/bookings/actions";
import { PaymentPercentInput } from "@/app/bookings/bookings-client";

export function PaymentButton({
  bookings,
}: {
  /** Booked, with something left to receive. BKG-000001 · Project · Plot. */
  bookings: Array<{ id: string; label: string; receivedPercent: string }>;
}) {
  const router = useRouter();
  // One key per opened form, so a double submit is the same payment, not two.
  const [key, setKey] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState(bookings[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const booking = bookings.find((b) => b.id === bookingId) ?? bookings[0];
  if (!booking) return null;
  const remaining = remainingPercent(booking.receivedPercent);
  const today = istDay(new Date());

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setError(null);
          setBookingId(bookings[0].id);
          setKey(globalThis.crypto.randomUUID());
        }}
      >
        Record Payment
      </Button>
      {key && (
        <Modal
          title="Confirm Payment Received"
          description={bookings.length === 1 ? booking.label : undefined}
          onClose={() => setKey(null)}
        >
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              const result = await confirmPaymentReceivedAction(
                {
                  bookingId: booking.id,
                  percent: String(f.get("percent")),
                  paidOn: String(f.get("paidOn")),
                  reference: String(f.get("reference")),
                  remark: String(f.get("remark") ?? ""),
                },
                key
              );
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setKey(null);
              router.refresh();
            }}
          >
            {bookings.length > 1 && (
              <Field label="Booking">
                <select
                  className={`${inputClass} w-full`}
                  value={booking.id}
                  onChange={(e) => setBookingId(e.target.value)}
                >
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} — {Number(b.receivedPercent).toFixed(2)}% received
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {/* Not max 100: this is one payment against what is left. Keyed by
                the Booking, so switching Bookings clears a figure meant for the
                other one. */}
            <Field label={`Payment Received This Time (%) — ${remaining}% remaining`}>
              <PaymentPercentInput key={booking.id} max={remaining} />
            </Field>
            <Field label="Payment Date">
              <Input name="paidOn" type="date" defaultValue={today} max={today} required />
            </Field>
            <Field label="Payment Reference No.">
              <Input name="reference" required />
            </Field>
            <Field label="Remark">
              <Input name="remark" />
            </Field>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setKey(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Confirming…" : "Confirm payment"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
