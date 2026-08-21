# CR-003 — Multi-factor authentication removed

Raised under [`PRD.md`](../PRD.md) §28 and the change-control rule in
[`PHASES.md`](../PHASES.md).

| | |
| --- | --- |
| **Change Request ID** | CR-003 |
| **Raised** | 21 August 2026 |
| **Owner** | _Product Owner — name and signature below_ |
| **Status** | Raised. Implemented on `main`; awaiting the owner's signature |
| **Release target** | First production release (go-live) |

**This CR contradicts the approved baseline in a governed area.** It removes a
control the v3.1 documents make mandatory, in identity and permissions. It is the
heaviest kind of change the process covers, and it must not be treated as
approved until signed.

---

## 1. What the approved baseline says today

| Clause | Wording |
| --- | --- |
| `PRD.md` §3.1 | "MFA remains mandatory for MD and Admin." |
| `PRD.md` §17.1 | "MFA mandatory for MD/Admin." |
| `PRD.md` §27 gate 8 | "Security/access testing and MD/Admin MFA pass." |

---

## 2. Exact approved wording

> **2.1** Multi-factor authentication is removed from the system. No role
> requires a second factor to sign in.
>
> **2.2** Sign-in is by login identifier and password alone. The existing
> protections remain unchanged: rate limiting, account lockout after repeated
> failures, a generic error that does not distinguish an unknown identifier from
> a wrong password, session expiry, and immediate session invalidation on
> password change or account disable.
>
> **2.3** The clauses in §3.1, §17.1 and go-live gate 8 requiring MFA for MD and
> Admin are withdrawn.
>
> **2.4** No MFA secret is stored. The columns that held them are dropped and any
> values in them are destroyed with the column.
>
> **2.5** Reinstating MFA later requires its own change request.

---

## 3. Affected screens, data and statuses

### Screens

| Screen | Change |
| --- | --- |
| Sign in | The MFA code field is gone |
| My Account | The "Two-factor authentication" card is gone |
| Administration → Staff | The MFA column is gone |

### Data

**Schema change, applied by migration `20260821120000_remove_mfa`:**

- `StaffAccount.mfaSecretCipher` — dropped
- `StaffAccount.mfaEnrolledAt` — dropped
- `SecurityEventType` — the `MFA_FAILURE` and `MFA_REQUIRED` values removed

### Statuses

No booking, plot, commission or payment status is affected.

---

## 4. Permission impact

No permission is added or removed. What changes is the **strength of the control
protecting the two most powerful roles**.

Before this CR, an attacker holding an MD or Admin password still could not sign
in. After it, the password is sufficient. Those two roles can:

- read a full Aadhaar Number and PAN for any Person (CR-002)
- create staff accounts and reset any password
- disable staff and reassign their work
- approve a Person Merge

**The owner is accepting that a single stolen or guessed password now reaches all
of the above.** The mitigations that remain are the password minimum length,
lockout after repeated failures, the audit trail, and the security log of every
sensitive access. This paragraph exists so that the acceptance of that risk is
explicit and recorded, not assumed.

---

## 5. Migration impact

Migration `20260821120000_remove_mfa` drops the two columns and the two enum
values. It is irreversible: any enrolled secret is destroyed with the column, and
reinstating MFA would mean re-enrolling every account from scratch.

Applied to the development database on 21 August 2026. On production it runs as
part of `npx prisma migrate deploy` before first use.

---

## 6. Acceptance-test impact

**Removed** — these tested a control that no longer exists:

- `security.check.ts` — `mfaRequired` per role; TOTP generation, verification and
  drift tolerance
- `db.check.ts` — the seeded MD is enrolled and their secret round-trips

**Unchanged and still passing:** password hashing and verification, lockout after
repeated failures, the generic login error, session invalidation, sensitive-field
masking, and the check that no secret reaches an audit payload.

**Go-live gate 8 is narrowed**, not deleted: security and access testing still
applies; the MFA half of it is withdrawn by clause 2.3.

---

## 7. Implementation reference

| | |
| --- | --- |
| Login | `src/app/login/actions.ts`, `src/app/login/page.tsx` |
| Account | `src/app/account/` |
| Administration | `src/app/administration/` |
| Auth | `src/lib/security/auth.ts` |
| Seed | `prisma/seed.ts` (`prisma/otp.ts` and `npm run db:otp` deleted) |
| Migration | `prisma/migrations/20260821120000_remove_mfa/` |

---

## 8. Owner sign-off

By signing, the owner:

1. approves the wording in section 2 as a requirement of the system;
2. withdraws the MFA clauses in `PRD.md` §3.1, §17.1 and gate 8; and
3. accepts the risk stated in section 4 — that a single password now reaches full
   Aadhaar and PAN visibility, staff account creation, password resets and Person
   Merge approval.

| | |
| --- | --- |
| Name | |
| Role | |
| Date | |
| Signature | |
