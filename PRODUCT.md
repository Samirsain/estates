# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Staff** of the 3% Real Estate Club run the CRM: Projects, Plots, Enquiries, Holds, Bookings, Members, Customers, commission.
- **Public Project Portal visitors** (no sign-in): dealers (Members), buyers and new customers who receive the `/p` link on WhatsApp. They open it on a phone to see which Plot is Available, on Hold or Sold / Booked, and its size and facing. They look; they do not act on the page.

## Product Purpose

One CRM for a plotted real-estate club in Rajasthan's Tier 2 / Tier 3 towns: dealers join free as Members, sell Plots of the club's Projects, and earn a written percentage commission. The Public Project Portal is the one window outside the office: live, true plot availability that anyone can open from a shared link, so nobody has to phone the office to ask "is P-105 still free?".

## Positioning

Availability on the portal is read live from the same records staff work in; a Hold or Booking made in the CRM shows on the portal within seconds. No copy, no stale PDF.

## Operating Context

- Links travel on WhatsApp; the funnel and the dealers live there.
- Visitors are on mobile phones, often mid-conversation with a buyer.
- On-screen labels are English; staff and dealers speak Hindi / Hinglish.

## Capabilities and Constraints

- Portal shows per Project: name, status, code, type, developer, RERA number, address, amenities, Layout / Location / 3D Visuals links, Download PDF (Project Information Sheet).
- Per Plot: number, type (Residential / Commercial / Informal Sector), one of three statuses (Available, Hold, Sold / Booked), size (width × length), area in sq ft / sq yd / sq m, facing.
- Projects with a traced site plan show every Plot on it, to scale, in its status colour; others show Plots as tiles in plot-number order.
- Search by plot number, filter by status, live refresh every two seconds.
- Not stored, so never shown: price, price per sq ft, Plot description, office contact. No enquiry form, no call or share button (owner, 31 Oct 2026: visitors only look).
- Percentage-only money model: no rupee value anywhere in the system.
- Nothing private on the portal: no Booking, Hold, Enquiry or Person is read.

## Brand Commitments

- Name: 3% REAL ESTATE CLUB. Logo: `public/logo.svg` (orange).
- The portal keeps the CRM's look — same colours and type (`src/app/globals.css`, `system/apple-design-reference.md`) — with a better layout (owner, 31 Oct 2026).
- Status colours are green (Available), amber (Hold), red (Sold / Booked) and nothing else.

## Evidence on Hand

- Real Projects and Plots in the database (Ganpati Estate Emporio has a traced site plan in `src/lib/project-layouts`).
- No photographs, testimonials or prices exist; none may be invented.

## Product Principles

1. The Plot's status is the answer the visitor came for; reach it first.
2. True and live beats rich: show only what the records hold.
3. Phone first: every control fits a thumb, every number reads without zoom.
4. Nothing private leaves the office.

## Accessibility & Inclusion

Status is never colour alone: every Plot also carries its status in words (label, tile text or dialog). Readable at arm's length on a mid-range Android phone in daylight.
