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
| [CR-005](./CR-005-plc-catalogue-and-derivation.md) | Location Charge components become a fixed catalogue, derived from Plot boundaries | Inventory | Raised, implemented on the owner's instruction — awaiting signature |
| [CR-006](./CR-006-member-terms-acceptance.md) | Recorded acceptance of the Member Terms and Privacy Notice at portal sign-in | Identity, authentication | Raised, implemented on the owner's instruction — awaiting signature |
| [CR-007](./CR-007-commission-calculator.md) | A Commission Calculator inside the CRM | Commission — **reopens an express owner exclusion** | Raised, awaiting signature — **not implemented; nothing is built until signed** |

**Status meanings**

- **Raised** — written down, but not yet signed by the owner. CR-001, CR-002,
  CR-003, CR-005 and CR-006 were implemented before signature; CR-004 and CR-007
  deliberately were not. Both change what the company owes rather than recording
  something already built, and CR-007 additionally reopens an item the owner
  excluded by name.
- **Approved** — the owner has signed section 7. It is a requirement of the
  system from that date.
- **Withdrawn** — not proceeding. The reason stays in the file.

A change affecting commission, payment, inventory, identity, permissions or legal
completion must be raised here. A display-only change need not be, but recording
it costs little and answers the reviewer who compares the screens against
[`DESIGN.md`](../DESIGN.md) — which is why CR-001 is here.

[`DEVIATIONS.md`](../DEVIATIONS.md) is the plain-language summary of the same two
items, for readers who want the shape of the change without the formal fields.
