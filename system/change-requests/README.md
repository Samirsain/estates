# Change Request Register

Every change to the approved v3.1 baseline is raised here before it is treated as
a requirement, in the form [`PRD.md`](../PRD.md) §28 sets out: Change Request ID,
Owner, Exact approved wording, Affected screens/data/statuses, Permission impact,
Migration impact, Acceptance-test impact, Release target.

| ID | Title | Governed area | Status |
| --- | --- | --- | --- |
| [CR-001](./CR-001-relationship-length.md) | Relationship length shown for Members and Customers | None — display only | Raised, awaiting signature |
| [CR-002](./CR-002-identity-reveal.md) | Administration screen for reading a full Aadhaar or PAN | Identity | Raised, awaiting signature |
| [CR-003](./CR-003-remove-mfa.md) | Multi-factor authentication removed | Identity, permissions | Raised, awaiting signature — **contradicts PRD §3.1, §17.1 and gate 8** |
| [CR-004](./CR-004-loyalty-separate-allowances.md) | Loyalty Bonus split into two separate three-deal allowances | Commission | Raised, awaiting signature — **not implemented; nothing is built until signed** |

**Status meanings**

- **Raised** — written down, but not yet signed by the owner. CR-001, CR-002 and
  CR-003 were implemented before signature; CR-004 deliberately was not, because
  it changes a commission entitlement rather than recording one already built.
- **Approved** — the owner has signed section 7. It is a requirement of the
  system from that date.
- **Withdrawn** — not proceeding. The reason stays in the file.

A change affecting commission, payment, inventory, identity, permissions or legal
completion must be raised here. A display-only change need not be, but recording
it costs little and answers the reviewer who compares the screens against
[`DESIGN.md`](../DESIGN.md) — which is why CR-001 is here.

[`DEVIATIONS.md`](../DEVIATIONS.md) is the plain-language summary of the same two
items, for readers who want the shape of the change without the formal fields.
