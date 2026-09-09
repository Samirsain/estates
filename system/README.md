# `system/` — what each document is

The approved requirements for the 3% Club CRM / Dashboard. The code cites these
files by name and section, so a rename here means a rename in the code comments
too.

## Start here

| File | What it is |
| --- | --- |
| [`prd-complete.md`](./prd-complete.md) | **The complete specification.** Version 3.0 baseline with the v3.1 corrections already folded in. Read this one first. |
| [`prd-corrections.md`](./prd-corrections.md) | The v3.1 **correction layer only** — the addendum that `prd-complete.md` consolidates. Kept for traceability, not for reading end to end. |

## Companions to the PRD

| File | What it is |
| --- | --- |
| [`architecture.md`](./architecture.md) | Technical architecture — data model, services, security, jobs. |
| [`design.md`](./design.md) | Product and UX design specification — screens, states, wording. |
| [`delivery-phases.md`](./delivery-phases.md) | Delivery plan: what is built in which phase, and the change-control rule. |
| [`plc-location-charge.md`](./plc-location-charge.md) | PLC (Preferred Location Charge) specification. PLC is a percentage only — never a rupee value. |

## Approved changes after the baseline

| File | What it is |
| --- | --- |
| [`approved-changes-pack.md`](./approved-changes-pack.md) | The second, larger pack of approved business changes. Overrides the baseline only where it says so. |
| [`approved-changes-implementation-log.md`](./approved-changes-implementation-log.md) | Running record of what has actually been built against that pack, with AC-nn references that also appear in the code. |
| [`change-requests/`](./change-requests) | One file per formal change request (CR-001 …), plus the register in its own README. |
| [`change-requests/member-terms-and-conditions.md`](./change-requests/member-terms-and-conditions.md) | The Member Terms & Conditions text. Read at runtime by `src/lib/terms.ts` — renaming it breaks the terms screen. |
| [`approved-deviations.md`](./approved-deviations.md) | Anything the running system does that the approved documents do not describe, with the reason. |

## Features specified separately

| File | What it is |
| --- | --- |
| [`land-inquiry-feature.md`](./land-inquiry-feature.md) | Land Inquiry Management (`/land-inquiries`) — implementation-ready specification. |

## As built

| File | What it is |
| --- | --- |
| [`as-built-land-inquiry-and-profiles.md`](./as-built-land-inquiry-and-profiles.md) | What the running dashboard does today: the Land Inquiry flow, the Customer → Member conversion, and the Customer and Member profile screens field by field. Read from the code, not from the requirements. |

## Testing

| File | What it is |
| --- | --- |
| [`commission-rules-and-test-plan.md`](./commission-rules-and-test-plan.md) | The commission rulebook: every rule, formula and event, with worked examples, plus how it is tested. |
| [`mock-data-v1.md`](./mock-data-v1.md) | First fictional UAT dataset. Built by `npm run uat:seed`. |
| [`mock-data-v2.md`](./mock-data-v2.md) | Current fictional UAT dataset, covering the newly approved commission changes. Built by `npm run uat:seed:v2`. |
| [`commission-test-brief.md`](./commission-test-brief.md) | The original plain-language brief that asked for the commission test — the question `commission-rules-and-test-plan.md` answers. |

## Go-live

| File | What it is |
| --- | --- |
| [`deployment.md`](./deployment.md) | How the system is deployed. |
| [`go-live-evidence.md`](./go-live-evidence.md) | What to run to produce each item of evidence the go-live gates ask for. |

## Brand

| File | What it is |
| --- | --- |
| [`apple-design-reference.md`](./apple-design-reference.md) | The visual reference the UI follows. Cited from component files such as `src/components/ui/button.tsx`. |
| [`logo.svg`](./logo.svg) | The logo. |
