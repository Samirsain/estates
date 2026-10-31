---
version: 1
slug: "src-app-p"
primary_target: "src/app/p"
related_targets: ["src/app/p/[slug]"]
---

# Public Project Portal (/p, /p/[slug])

Scope: the two no-login portal pages. Visitor mode: Operate. Audience: dealers, buyers and new customers opening a WhatsApp link on a phone to see which Plot is Available, Hold or Sold / Booked, and its size. They only look: no call, share or enquiry action (owner, 31 Oct 2026). Constraints: CRM colours and type kept; no logo or "Projects" heading on /p (owner, 31 Oct 2026); status colours green / amber / red only; nothing private.

Owner's complaints the build must answer: too much scrolling before the Plots; the page reads bland and generic.

## Direction contract

THESIS: Every Project lives in one strip; opening one lands on its Plots, not on a page about it. Refuses the category default of identity card, amenities, stat tiles, then the plan at the bottom.

OWN-WORLD: CRM tokens: white canvas, ink #1d1d1f, hairline dividers, one interactive orange #c1471a; status green / amber / red. Signature: the availability bar, a proportional green-amber-red strip, small under each Project in the strip and full width over the counts.

STORY: The visitor sees the Project, how much is free, and the plan at once; taps a count to see only those Plots; taps a Plot to read its size and facing in a sheet; switches Project from the strip.

FIRST VIEWPORT (390 × 844): sticky Project strip (All + every Project, each with its bar); Project name, status, developer, RERA and a Live dot; full-width bar over three count buttons (Available / Hold / Sold / Booked) that filter; search plus Plan | List; the site plan from about 300px down, zoomed, zoom controls floating on it. About this project folds below.

FORM: Project switcher, position 7 of 7 on the ordered list; seed ccf77ba0. Raises: grid and plan are one space (Show on site plan); a live status change flips its Plot once; the plan never shrinks to a miniature on a phone.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
