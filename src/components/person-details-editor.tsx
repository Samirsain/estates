"use client";

// Edit details, on a Customer's and a Member's profile.
//
// A record usually starts as a name and a mobile taken over the phone. This is
// where the rest arrives later, so only those two are compulsory and every
// other field is free to stay blank until somebody knows it.

import React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { updatePersonDetailsAction, type PersonDetails } from "@/app/people/actions";
import { enterBankDetailsAction } from "@/app/members/actions";

export function PersonDetailsEditor({
  personId,
  person,
  bank,
  canEnterBank,
}: {
  personId: string;
  /** The Person as it stands, so the form opens on what is already on file. */
  person: PersonDetails;
  /**
   * The newest bank entry, so a correction starts from what is on file rather
   * than from an empty form. The account number is never among it — it is
   * encrypted at rest and revealed only through its own logged action.
   */
  bank?: {
    accountHolder: string;
    bankName: string;
    branchName: string | null;
    ifsc: string;
    accountLastFour: string;
    status: string;
  } | null;
  /** Bank entry is its own permission, and its own trip through Accounts. */
  canEnterBank?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit details
      </Button>

      {open && (
        <Modal
          title="Edit details"
          description="Name and mobile are required. Everything else can be filled in whenever it is known. Aadhaar and PAN are not edited here."
          onClose={() => setOpen(false)}
        >
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const get = (k: string) => String(f.get(k) ?? "");
              setBusy(true);
              setError(null);
              const outcome = await updatePersonDetailsAction(
                personId,
                {
                  fullName: get("fullName"),
                  mobile: get("mobile"),
                  altMobile: get("altMobile"),
                  email: get("email"),
                  city: get("city"),
                  addressLine: get("addressLine"),
                  dateOfBirth: get("dateOfBirth"),
                },
                get("reason"),
                globalThis.crypto.randomUUID()
              );
              setBusy(false);
              if (!outcome.ok) {
                setError(outcome.error);
                return;
              }
              setOpen(false);
              router.refresh();
            }}
          >
            <Field label="Full Name">
              <Input name="fullName" required defaultValue={person.fullName} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Primary Mobile">
                <Input name="mobile" required inputMode="tel" defaultValue={person.mobile} />
              </Field>
              <Field label="Alt Mobile">
                <Input name="altMobile" inputMode="tel" defaultValue={person.altMobile} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" defaultValue={person.email} />
              </Field>
              {/* Native date input: the browser already knows the locale, the
                  calendar and what a real date is. */}
              <Field label="Date of Birth">
                <Input
                  name="dateOfBirth"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  defaultValue={person.dateOfBirth}
                />
              </Field>
              <Field label="City">
                <Input name="city" defaultValue={person.city} />
              </Field>
              <Field label="Address">
                <Input name="addressLine" defaultValue={person.addressLine} />
              </Field>
            </div>

            <Field label="Reason — compulsory, kept in History">
              <Input name="reason" required minLength={3} placeholder="e.g. Address confirmed at site visit" />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : "Save details"}
              </Button>
            </div>
          </form>

          {canEnterBank && (
            // A sibling form, not a nested one: these fields do not save with
            // the details above. CRM enters a bank and Accounts verifies it
            // (PRD §14.4), so this submits a replacement for that decision and
            // whatever is verified today stays active until it is decided.
            <form
              className="space-y-3 border-t border-border/60 pt-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const get = (k: string) => String(f.get(k) ?? "");
                setBusy(true);
                setError(null);
                const outcome = await enterBankDetailsAction(
                  {
                    personId,
                    accountHolder: get("accountHolder"),
                    bankName: get("bankName"),
                    branchName: get("branchName"),
                    accountNumber: get("accountNumber"),
                    ifsc: get("ifsc"),
                  },
                  globalThis.crypto.randomUUID()
                );
                setBusy(false);
                if (!outcome.ok) {
                  setError(outcome.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              }}
            >
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Bank
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {bank
                    ? `On file: •••• ${bank.accountLastFour} · ${bank.status.charAt(0) + bank.status.slice(1).toLowerCase()}. Saving here replaces it, once Accounts verifies.`
                    : "Goes to Accounts for verification before it can be paid to."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Account Number">
                  <Input name="accountNumber" required inputMode="numeric" />
                </Field>
                <Field label="IFSC">
                  <Input
                    name="ifsc"
                    required
                    placeholder="HDFC0001234"
                    defaultValue={bank?.ifsc ?? ""}
                  />
                </Field>
                <Field label="Bank Name">
                  <Input name="bankName" required defaultValue={bank?.bankName ?? ""} />
                </Field>
                <Field label="Branch Name">
                  <Input name="branchName" required defaultValue={bank?.branchName ?? ""} />
                </Field>
              </div>

              {/* Not always the Person: a spouse's or a firm's account is
                  normal, and the name on it is what a transfer is matched
                  against. It opens on theirs and can be changed. */}
              <Field label="Account Holder">
                <Input
                  name="accountHolder"
                  required
                  defaultValue={bank?.accountHolder ?? person.fullName}
                />
              </Field>

              <div className="flex justify-end pt-1">
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  {busy ? "Saving…" : "Send bank details to Accounts"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
