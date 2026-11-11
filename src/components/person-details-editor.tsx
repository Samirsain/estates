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
import { AADHAAR_INPUT, ACCOUNT_NUMBER_INPUT, IFSC_INPUT, MOBILE_INPUT, PAN_INPUT } from "@/components/ui/field-formats";
import { Field, Modal } from "@/components/ui/modal";
import { updatePersonDetailsAction, type PersonDetails } from "@/app/people/actions";
import { enterBankDetailsAction } from "@/app/members/actions";
import { RemarkSelect } from "@/components/ui/remark-select";
import { useHashOpen } from "@/lib/hash-open";
import { istDay } from "@/lib/tasks";
import { MemberBusinessFields, readMemberBusiness } from "@/components/member-business-fields";

export function PersonDetailsEditor({
  personId,
  person,
  bank,
  canEnterBank,
  business,
  askAadhaar,
  askPan,
  photoReceived,
}: {
  personId: string;
  /**
   * The Person as it stands, so the form opens on what is already on file.
   * A role that reads mobiles masked gets them blank, with the mask as a hint.
   */
  person: PersonDetails & { mobileOnFile?: string; altMobileOnFile?: string };
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
  /** Member profile only: Firm Name, Deals In, Experience as on file. */
  business?: { firmName: string; dealsIn: string[]; experience: string | null };
  /** While no Aadhaar is on file — it is written once. */
  askAadhaar?: boolean;
  /** While no PAN is on file — it is written once, like the Aadhaar. */
  askPan?: boolean;
  /** Member profile only: the "Photo Received" tick as on file. */
  photoReceived?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Each form's error sits beside its own Save button: the dialog scrolls, and
  // a refusal printed at the top was never seen from the bank Save button.
  const [error, setError] = React.useState<string | null>(null);
  const [bankError, setBankError] = React.useState<string | null>(null);
  const [bankSaved, setBankSaved] = React.useState(false);
  // A Payout "Add Bank" button opens this by link.
  useHashOpen("edit-details", () => setOpen(true));

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit details
      </Button>

      {open && (
        <Modal
          title="Edit details"
          onClose={() => setOpen(false)}
        >
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
                  nickname: person.nickname === undefined ? undefined : get("nickname"),
                  mobile: get("mobile"),
                  altMobile: get("altMobile"),
                  email: get("email"),
                  city: get("city"),
                  addressLine: get("addressLine"),
                  dateOfBirth: get("dateOfBirth"),
                  business: business ? readMemberBusiness(f) : undefined,
                  aadhaar: askAadhaar ? get("aadhaar") : undefined,
                  pan: askPan ? get("pan") : undefined,
                  photoReceived: photoReceived === undefined ? undefined : f.get("photoReceived") === "on",
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
            {person.nickname !== undefined && (
              <Field label="Nickname">
                <Input name="nickname" defaultValue={person.nickname} />
              </Field>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Primary Mobile">
                <Input
                  name="mobile"
                  required={!person.mobileOnFile}
                  {...MOBILE_INPUT}
                  defaultValue={person.mobile}
                  placeholder={person.mobileOnFile ? `${person.mobileOnFile} · blank keeps it` : MOBILE_INPUT.placeholder}
                />
              </Field>
              <Field label="Alternate Mobile">
                <Input
                  name="altMobile"
                  {...MOBILE_INPUT}
                  defaultValue={person.altMobile}
                  placeholder={person.altMobileOnFile ? `${person.altMobileOnFile} · blank keeps it` : "Optional"}
                />
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
                  max={istDay(new Date())}
                  defaultValue={person.dateOfBirth}
                />
              </Field>
              <Field label="City">
                <Input name="city" defaultValue={person.city} />
              </Field>
              <Field label="Address">
                <Input name="addressLine" defaultValue={person.addressLine} />
              </Field>
              {askAadhaar && (
                <Field label="Aadhaar Number">
                  <Input name="aadhaar" {...AADHAAR_INPUT} />
                </Field>
              )}
              {askPan && (
                <Field label="PAN Number">
                  <Input
                    name="pan"
                    {...PAN_INPUT}
                    className="uppercase"
                  />
                </Field>
              )}
              {/* Beside the PAN Number (owner, 11 Nov 2026), level with its box. */}
              {photoReceived !== undefined && (
                <label className="flex h-10 items-center gap-2 self-end text-sm">
                  <input type="checkbox" name="photoReceived" defaultChecked={photoReceived} className="h-4 w-4 accent-primary" />
                  Photo Received
                </label>
              )}
            </div>

            {business && <MemberBusinessFields {...business} />}

            <Field label="Reason — compulsory, kept in History">
              <RemarkSelect presets="editPerson" name="reason" required />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
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
                setBankError(null);
                setBankSaved(false);
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
                  setBankError(outcome.error);
                  return;
                }
                // The dialog stays open: closing it on a bank save threw away
                // unsaved edits in the details form above.
                setBankSaved(true);
                router.refresh();
              }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Bank
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* The account on file shows as the placeholder, last four only —
                    the number itself is never sent to the form. */}
                <Field label="Account Number">
                  <Input
                    name="accountNumber"
                    required
                    {...ACCOUNT_NUMBER_INPUT}
                    placeholder={bank ? `\u2022\u2022\u2022\u2022 ${bank.accountLastFour}` : undefined}
                  />
                </Field>
                <Field label="IFSC">
                  <Input
                    name="ifsc"
                    required
                    {...IFSC_INPUT}
                    className="uppercase"
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

              {bankError && (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {bankError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                {bankSaved && <span className="text-xs text-emerald-700">Bank details saved.</span>}
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  {busy ? "Saving…" : "Save bank details"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
