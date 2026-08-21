# CR-002 — Administration screen for reading a full Aadhaar or PAN

Raised under [`PRD.md`](../PRD.md) §28 and the change-control rule in
[`PHASES.md`](../PHASES.md).

| | |
| --- | --- |
| **Change Request ID** | CR-002 |
| **Raised** | 21 August 2026 |
| **Owner** | _Product Owner — name and signature below_ |
| **Status** | Raised. Implemented on `main`; awaiting the owner's signature |
| **Release target** | First production release (go-live) |

**This CR touches a governed area — identity.** It is raised formally for that
reason, even though the permission it exercises already exists in the approved
baseline.

---

## 1. Exact approved wording

> **1.1** Administration contains an `Aadhaar / PAN` screen listing People with
> their Aadhaar and PAN shown **masked**, alongside the Aadhaar Status and the
> PAN Available / Not Available status.
>
> **1.2** A user holding the full-Aadhaar field permission — MD and Admin — may
> reveal the full Aadhaar Number and PAN of a named Person, one Person at a time,
> by an explicit action.
>
> **1.3** Every reveal writes a `SENSITIVE_ACCESS` security event recording the
> staff account that performed it and the Person whose values were read. An
> attempt by a role without the permission writes a `PERMISSION_DENIED` event and
> reveals nothing.
>
> **1.4** Values are never cached, pre-loaded or included in any list response.
> Each reveal is its own request and its own logged event.
>
> **1.5** No Aadhaar or PAN value is included in any export. Exports remain
> masked under `PRD.md` §21.
>
> **1.6** The screen adds no way to edit, upload or delete an Aadhaar or PAN. The
> no-upload model in RD-05 is unchanged.

---

## 2. Affected screens, data and statuses

### Screens

| Screen | Change |
| --- | --- |
| Administration | New `Aadhaar / PAN` tab: masked list, per-Person **Reveal** |

`DESIGN.md` §17 describes Administration but does not enumerate this tab. That
is the gap this CR closes.

### Data

**No schema change.** The screen reads columns that already exist and are already
encrypted at rest: `Person.aadhaarCipher`, `Person.panCipher` and their status
fields. It writes only `SecurityEvent` rows, which the approved model already
defines.

### Statuses

None added or altered. Aadhaar Status and PAN Status keep the meanings in
`PRD.md` §14.1 and §14.2.

---

## 3. Permission impact

**No new permission.** The screen exercises the existing `AADHAAR_FULL` field
permission, which `PRD.md` RD-05 already grants to specifically authorised
MD/Admin.

What changes is that the permission now has a screen. Before this CR the
permission existed in the matrix with no way to use it; a full Aadhaar could only
be read from the database directly, which is both less controlled and unlogged.
This CR moves that access into the application where the log is written.

| Role | Before | After |
| --- | --- | --- |
| MD, Admin | Permission held, no screen | Reveal, each one logged |
| Accounts, CRM, MIS, PC | Masked values only | Masked values only, attempt logged |
| Member | No access | No access |

---

## 4. Migration impact

**None.** No back-fill, no new reconciliation rule.

---

## 5. Acceptance-test impact

Existing coverage, unchanged and still passing:

- `src/lib/security/security.check.ts` — `canViewField` grants `AADHAAR_FULL` to
  MD and Admin only (`npm run check`)
- `prisma/db.check.ts` — encryption at rest, the blind index, and masking
- `prisma/phase7.check.ts` — no secret or protected value appears in an audit
  payload

**New tests the owner should require before go-live**, as part of the gate 8
security testing in `PRD.md` §27:

1. A reveal by MD writes exactly one `SENSITIVE_ACCESS` event naming the reader
   and the Person read.
2. A reveal attempted by Accounts, CRM, MIS or PC is refused and writes a
   `PERMISSION_DENIED` event.
3. A masked export taken after a reveal still contains no Aadhaar or PAN value.

These are stated here so the acceptance-test impact is explicit rather than
assumed. They are not yet automated.

---

## 6. Implementation reference

| | |
| --- | --- |
| Actions | `revealIdentityAction`, `identityDirectoryAction` in `src/app/administration/actions.ts` |
| Screen | `src/app/administration/administration-client.tsx` |
| Permission | `canViewField` in `src/lib/security/permissions.ts` |
| Commit | `c7a1611` |

---

## 7. Owner sign-off

By signing, the owner approves the wording in section 1 as a requirement of the
system, and accepts that MD and Admin can read full Aadhaar and PAN values
through the application with every access logged.

| | |
| --- | --- |
| Name | |
| Role | |
| Date | |
| Signature | |
