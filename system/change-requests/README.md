# Change Request Register

Every change to the approved v3.1 baseline is raised here before it is treated as
a requirement, in the form [`prd-corrections.md`](../prd-corrections.md) §28 sets out: Change Request ID,
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
| [CR-028](./CR-028-to-CR-032-owner-rulings-24-nov-2026.md#cr-028--plc-version-is-optional) | PLC Version is optional | Inventory | Raised, implemented on the owner's instruction (24 Nov 2026) — awaiting signature |
| [CR-029](./CR-028-to-CR-032-owner-rulings-24-nov-2026.md#cr-029--a-plot-may-be-booked-before-its-customer-is-known) | A Plot may be booked under a Member before its Customer is known; Add Customer later | Inventory, commission | Raised, implemented on the owner's instruction (24 Nov 2026) — awaiting signature |
| [CR-030](./CR-028-to-CR-032-owner-rulings-24-nov-2026.md#cr-030--md-is-the-highest-authority) | MD needs no other account's approval; maker-checker lifted for MD only | Permissions | Raised, implemented on the owner's instruction (24 Nov 2026) — awaiting signature |
| [CR-031](./CR-028-to-CR-032-owner-rulings-24-nov-2026.md#cr-031--add-city-on-the-booking-form) | + Add City on the booking and other Customer/Member forms | None — City Master | Raised, implemented on the owner's instruction (24 Nov 2026) — awaiting signature |
| [CR-032](./CR-028-to-CR-032-owner-rulings-24-nov-2026.md#cr-032--no-limit-on-plots-per-customer) | No limit on Plots per Customer; the three-position rule and its MD exception are removed | Inventory | Raised, implemented on the owner's instruction (24 Nov 2026) — awaiting signature |

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
[`design.md`](../design.md) — which is why CR-001 is here.

[`approved-deviations.md`](../approved-deviations.md) is the plain-language summary of the same two
items, for readers who want the shape of the change without the formal fields.
