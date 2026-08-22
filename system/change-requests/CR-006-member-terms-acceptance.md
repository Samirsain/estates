# CR-006 — Recorded acceptance of the Member Terms and Privacy Notice at portal sign-in

Raised under [`PRD.md`](../PRD.md) §28 and the change-control rule in
[`PHASES.md`](../PHASES.md).

| | |
| --- | --- |
| **Change Request ID** | CR-006 |
| **Raised** | 22 August 2026 |
| **Owner** | _Product Owner — name and signature below_ |
| **Status** | Raised and **implemented on the owner's instruction during the build session.** The signature block below is outstanding |
| **Release target** | To be set by the owner |

**This CR touches authentication and identity, a governed area.** It adds a step
to Member portal sign-in and a new record against the Member.

---

## 1. What the approved baseline says today

| Clause | Wording |
| --- | --- |
| `main-PRD.md` §17.1 | "Member login uses Member ID; mobile alone is insufficient." |
| `main-PRD.md` §22.4 | Member reset rules |
| `main-PRD.md` §7.1 | Member activation |
| `main-PRD.md` §30 | Excludes a "Personal-data request and privacy-complaint workflow" |
| `PRD.md` §23.5 | Append-only histories |

The baseline describes no Terms acceptance at any point in the Member journey.
The Terms document itself does:

> `3%_T&C.md` §2.1 — "A person becomes a Member only after: … **The person
> accepts the applicable Terms and Privacy Notice.** … The Member profile is
> activated."

So the requirement exists in the commercial document and has no implementation.
This closes that gap.

---

## 2. Exact approved wording

> **2.1** A Member must accept the published Terms and Privacy Notice before the
> Member portal will admit them.
>
> **2.2** Acceptance is recorded against the Member: the Member, the published
> version accepted, the instant of acceptance, and the originating IP address.
> The record is never updated in place.
>
> **2.3** Acceptance is asked **once per published version**. A Member who has
> accepted the current version signs in without being asked again. Publishing a
> new version asks every Member once more and leaves the earlier records intact.
>
> **2.4** The document is placed in front of the Member at that step, not linked
> past it. The acceptance control stays inactive until the Member has read the
> document to the end. The same document is also readable at its own address
> without signing in.
>
> **2.5** Nothing else about Member sign-in changes: the Member ID remains the
> login identifier, rate limiting, lockout, session version and the generic
> failure message are all unaffected.

---

## 3. Why it is raised rather than simply built

`main-PRD.md`'s hierarchy §4 requires a numbered change request where the
baseline is silent and a developer would otherwise choose a rule. The baseline
is silent on Terms acceptance, and this adds a step a Member must pass to reach
the portal — a change to an authentication flow, which §28 governs.

## 4. Why acceptance is recorded rather than re-ticked

A checkbox shown at every sign-in and stored nowhere answers no question that
would ever be asked of it, and a checkbox next to an unopened link answers the
wrong one. The questions that get asked are "did this Member
accept?", "which version?" and "when?" — and only a record answers them. It is
also the shape `PRD.md` §23.5 asks for: append-only, never overwritten.

The sequence this produces:

1. Member submits Member ID and password.
2. Credentials are checked exactly as before.
3. If the Member has already accepted the current version, sign-in completes.
4. If not, the form returns carrying the Member ID, with the full document in a
   scrollable panel beneath the password field. Only the password is retyped.
5. The acceptance box activates once the panel has been read to its end.
6. Ticking it and submitting records the acceptance and completes sign-in.

Step 5 is an honest affordance, not a security control: it makes reading the
default rather than an extra click, and it is the difference between "a Member
accepted these Terms" and "a Member ticked a box next to a link". A client with
scripting disabled or a person determined to bypass it can still submit; what
the record then says is exactly what happened, which is the point.

Step 4 is the one visible departure from the "one screen" sketch the owner was
shown. It is unavoidable: the sign-in screen cannot know whether a Member has
already accepted until that Member identifies themselves, so the alternative is
to show the box to everybody at every sign-in — which §2.3 rules out.

## 5. What is stored

`MemberTermsAcceptance` — `memberProfileId`, `version`, `acceptedAt`, `ip`.
Unique on Member and version, so a repeated submission cannot create a second
row for the same version.

The IP is kept for a later dispute about who accepted. It is never used to
identify or locate anyone, which is the boundary `3%_T&C.md` §5 draws.

## 6. What is deliberately not included

- **No staff equivalent.** Staff are bound by employment terms, not these.
- **No acceptance at activation.** `§2.1` places acceptance at becoming a
  Member, and activation happens in the CRM without the Member present. Asking
  at first sign-in is the first moment the Member is actually there to accept.
- **No version table.** The document lives in the repository and its version is
  a constant beside it (`MEMBER_TERMS_VERSION`). A table would add a place for
  the two to disagree.

## 7. Where it lives

`src/lib/terms.ts` (version, reader, parser); `src/app/terms/page.tsx` (the
public document); `src/app/login/actions.ts` and `src/app/login/page.tsx` (the
step); `prisma/migrations/20260824150000_member_terms_acceptance`.

---

## 8. Owner signature

| | |
| --- | --- |
| **Approved by** | |
| **Signature** | |
| **Date** | |
