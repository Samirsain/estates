---
name: 3% Real Estate Club
description: A light gallery for operational records. White canvas, ink type, hairlines, and one orange that means "you can press this".
colors:
  primary: "#c1471a"
  primary-focus: "#d74f1d"
  accent-book: "#1a68c1"
  destructive: "#b81e38"
  ink: "#1d1d1f"
  canvas: "#ffffff"
  parchment: "#f5f5f7"
  pearl: "#fafafc"
  hairline: "#e0e0e0"
  placeholder: "#a3a3a3"
  status-available: "#10b981"
  status-available-ink: "#022c22"
  status-available-rule: "#059669"
  status-available-wash: "#ecfdf5"
  status-hold: "#fbbf24"
  status-hold-ink: "#451a03"
  status-hold-rule: "#f59e0b"
  status-hold-wash: "#fffbeb"
  status-sold: "#ef4444"
  status-sold-ink: "#2a0505"
  status-sold-rule: "#dc2626"
  status-sold-wash: "#fef2f2"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: "-0.3px"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.19
    letterSpacing: "-0.2px"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: "-0.374px"
  table:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "-0.224px"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.33
rounded:
  sm: "7px"
  md: "9px"
  lg: "11px"
  xl: "12px"
  2xl: "16px"
  modal: "20px"
  sheet: "22px"
  pill: "9999px"
spacing:
  hair: "2px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-focus}"
  button-outline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    height: "40px"
  button-book:
    backgroundColor: "{colors.accent-book}"
    textColor: "{colors.canvas}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "40px"
  input-search-portal:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "44px"
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
  chip-facing:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  plot-tile-available:
    backgroundColor: "{colors.status-available}"
    textColor: "{colors.status-available-ink}"
    rounded: "{rounded.lg}"
    height: "48px"
  plot-tile-hold:
    backgroundColor: "{colors.status-hold}"
    textColor: "{colors.status-hold-ink}"
    rounded: "{rounded.lg}"
    height: "48px"
  plot-tile-sold:
    backgroundColor: "{colors.status-sold}"
    textColor: "{colors.status-sold-ink}"
    rounded: "{rounded.lg}"
    height: "48px"
  project-strip-chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    width: "160px"
  project-strip-chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
---

# Design System: 3% Real Estate Club

## Overview

**Creative North Star: "The Gallery Ledger"**

The system is Apple's museum-gallery language turned to operational records: white and parchment canvases, ink type with tight negative tracking, hairline dividers in place of borders-as-decoration, and chrome that recedes so the records can be read. `src/app/globals.css` holds every value; `system/apple-design-reference.md` holds the reasoning. The project departs from that reference on one thing, the interactive colour: the logo's own orange hue, darkened until white text on it clears AA, replaces Action Blue.

It is dense by intent. Body copy sits at 15px rather than the reference's 17px marketing size, tables a step below, so a Plot row stays on one line. Hierarchy is carried by size and weight, not by grey: labels and helper text are set in the body ink because the owner found a mid-grey too faint.

The Public Project Portal (`/p`, `/p/[slug]`) is a surface inside this world, not a new one (owner, 31 Oct 2026: same colours and type, better layout). It adds a status vocabulary (green, amber, red) and one signature device, the availability bar.

**Key Characteristics:**
- One interactive colour; everything pressable is orange or sits in a neutral pill.
- Flat chrome separated by hairlines and a change of canvas; only floating layers lift.
- Pill buttons, softly rounded containers, no sharp corners anywhere.
- No web font; the platform face with SF Pro first.
- Status is green, amber, red, and nothing else.

## Colors

A near-neutral gallery with one warm interactive voice and a three-colour status code.

### Primary
- **Club Orange** (primary): every primary action, link, active nav item and selection tint. Same hue as the logo's #FF7844 / #E85C31 but dark enough to carry white text at 5.0:1.
- **Ember Focus** (primary-focus): focus rings and the hover state of the primary button.

### Secondary
- **Book Blue** (accent-book): the Book row action on the Plots list and nowhere else. Same saturation and lightness as Club Orange so it reads as a peer, not a louder button.

### Tertiary
- **Delete Crimson** (destructive): destructive buttons only. Held 26 degrees off Club Orange so Delete and Publish never read as the same button.

### Neutral
- **Ink** (ink): all text, headings, labels and helper copy; also the fill of the active Project chip.
- **Canvas** (canvas): page and card background.
- **Parchment** (parchment): chrome surfaces (sidebar, top bar), segmented-control tracks, quiet chips, hover wash.
- **Pearl** (pearl): the `card-surface` fill behind CRM cards.
- **Hairline** (hairline): every border, divider and field stroke, often at 60-80% opacity.
- **Hint Grey** (placeholder): placeholder text inside fields and nothing else.

### Status (Public Portal)
- **Available** (status-available fill, status-available-ink number, status-available-rule pressed rule, status-available-wash pressed background).
- **Hold** (status-hold family, same four roles).
- **Sold / Booked** (status-sold family, same four roles). Its ink is a custom deep red because red-950 reaches only 4.3:1 on the fill.

### Named Rules
**The One Voice Rule.** Club Orange is the only colour that means "press this". Book Blue is the single sanctioned exception, for Book only.

**The Three Lights Rule.** Plot status is green, amber or red. No fourth status colour, no brand orange on a status.

**The Dark Number Rule.** A Plot number on a status fill is printed in that status's dark ink, never white: white measured 2.5:1 on the green and 3.8:1 on the red.

## Typography

**Display Font:** SF Pro via `-apple-system` / `BlinkMacSystemFont` (falling back to system-ui, Segoe UI, Roboto)
**Body Font:** the same stack

**Character:** one platform face throughout, tightened with negative tracking at every size so headings feel engraved rather than loud.

### Hierarchy
- **Display** (600, 40px, 1.1): `h1` page titles in the CRM.
- **Headline** (600, 28px, 1.14): `h2` section heads.
- **Title** (600, 21px, 1.19): `h3` card and dialog heads.
- **Body** (400, 15px, 1.47): all running copy; the CRM's working size.
- **Table** (400, 14px, 1.43): dense operational tables.
- **Label** (600, 12px): field labels, group heads, chip text, count captions. Sentence case, no tracking change.

On the portal, the Project name sets at 22px bold (24px from md), and Plot numbers and counts are bold with tabular figures.

### Named Rules
**The Ink Not Grey Rule.** Labels and helper text use the body ink; hierarchy comes from size and weight. Grey is reserved for placeholders.

**The Tabular Figures Rule.** Every Plot number, count, area and RERA number uses tabular numerals so columns of figures align.

## Layout

The CRM shell is a 3.5rem icon rail (expanding on demand) plus a sticky parchment top bar holding search, account, and an underlined tab row; content pads 16px on phones and 20px from md. Rhythm runs in 4px steps, mostly 8, 12, 16 and 20px; groups stack with 16-20px gaps.

The portal is a single centred column: `max-w-3xl` for the Project list, `max-w-5xl` for a Project page, 16px side padding. A Project page is ordered for a phone's first viewport: the sticky Project strip, the Project header, the availability block, search with Plan | List, then the plan; "About this project" folds below in a `<details>`. Plot tiles fill an auto-fill grid with a 68px minimum and 8px gaps.

Touch targets on the portal sit at 44-48px (search 44px, count buttons and Plot tiles 48px, sheet close 40px, zoom 36px). Phones get a 16px search field so iOS Safari does not zoom; it drops to 14px from sm.

Horizontal scrollers (the Project strip, the site plan, the CRM nav) hide their scrollbar on touch. On the Public Portal no edge fades (owner, 31 Oct 2026): a chip or Plot cut off at the edge is the sign there is more. Only the CRM nav fades its right edge, with a mask, not a painted gradient.

## Elevation & Depth

Chrome is flat. Panels are separated by a hairline and a change of canvas (canvas to parchment), never by a shadow. Elevation belongs only to layers that float over the page and can be dismissed.

### Shadow Vocabulary
- **Modal** (`shadow-2xl`, with a 40% black backdrop): CRM dialogs.
- **Menu** (`shadow-lg` / `shadow-xl` on a 95% opaque surface with backdrop blur): dropdown menus.
- **Sheet** (`box-shadow: 0 -12px 40px -12px rgba(0,0,0,0.25)`): the portal's Plot details sheet, cast upward.
- **Pressed segment** (`shadow-sm`): the selected half of a segmented control.

### Named Rules
**The Flat Chrome Rule.** Nav, headers, cards and tiles carry no shadow. If it does not float and dismiss, it does not lift.

## Shapes

Everything is rounded; nothing is square. Actions are pills (9999px). Fields are gently curved (11px, `--radius`). Plot tiles and segmented controls sit at 11-12px, containers at 16px, dialogs at 20px and the bottom sheet at 22px on its top edge. Status dots are 8px circles. The availability bar is a pill track whose segments are pills too.

Borders are 1px hairlines; a dashed hairline marks an empty state.

## Components

### Buttons
Quiet, pill-shaped, colour only when it means something.
- **Shape:** full pill (9999px); the xs and icon-sm sizes step down to 11px.
- **Primary:** Club Orange with white label, 40px tall, 22px side padding, regular weight 14px.
- **Hover / Focus:** hover shifts to Ember Focus; focus draws a 2px Ember ring with a 2px offset. Disabled drops to 40% opacity.
- **Outline:** canvas fill, hairline stroke, orange label; hover takes a parchment wash.
- **Secondary / Ghost:** parchment fill or bare; hover parchment.
- **Destructive:** Delete Crimson with white label.

### Chips
- **Facing chip:** parchment pill, hairline stroke, 12px semibold ink label.
- **Status badge:** a pill with a 10% status tint, 30% status stroke and the status 700 shade for its text, led by an 8px status dot on the portal.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** canvas on the portal; pearl (`card-surface`) in the CRM.
- **Shadow Strategy:** none (Flat Chrome Rule).
- **Border:** 1px hairline at 70-80%.
- **Internal Padding:** 16px; list rows 16px, 20px from sm.

### Inputs / Fields
- **Style:** canvas fill, 1px hairline stroke, 11px radius, 40px tall, 14px text. The portal search is 44px, 12px radius, 16px text on phones, with a leading 16px search icon.
- **Focus:** 2px ring (Club Orange at 40% on the shared Input, Ember on the portal search).
- **Disabled:** 50% opacity, not-allowed cursor. Number fields carry no stepper and ignore the wheel.

### Navigation
- **CRM:** a parchment icon rail; the active item takes a 15% orange tint with orange semibold text. The top tab row underlines the active tab with a 2px orange rule.
- **Portal Project strip:** a sticky row of 160px chips (12px radius), each with the Project name and its availability bar; the open Project inverts to an ink fill with canvas text and is scrolled to the strip's centre. An "All" chip leads.

### Segmented Control
A parchment track (12px radius, 4px inset) holding two buttons; the selected one is a canvas fill with ink text and a small shadow, the other muted until hover. Used for Plan | List.

### Availability Bar (signature)
A pill track split green, amber, red, each segment a pill sized in proportion to its Plot count, 2px apart. 4px tall in the Project strip, 6px over the counts, 8px on the Project list. When a status filter is on, the other two segments fade to 20%. An empty Project shows the parchment track or a plain "No Plots on the portal" line. It always carries an accessible text summary.

### Counts-as-Filter
The availability bar sits flush on top of a three-cell joined control (12px radius, hairline dividers). Each cell is a status dot, a bold count and its label, 48px minimum. Pressed, the cell takes its status wash and a 3px inset bottom rule in the status rule colour; pressing again clears it.

### Plot Tile and Site Plan
Tiles are 48px tall, 11px radius, status fill with a one-step-darker stroke and the dark status ink number. Non-matching tiles drop to 25% opacity rather than disappearing; the selected tile takes a 2px ink ring with offset.

The site plan sits in a 16px-radius card with its own header bar: a small caption and a zoom group (minus, percentage, plus, 36px round buttons). Roads in stone grey, parks in emerald tint, Plots in the same status fills and inks as the tiles; a focused or selected Plot takes a slate-900 stroke.

### Plot Details Sheet
Non-modal (`aria-modal="false"`): the page stays live behind it. Rises from the bottom edge, max 512px wide, 22px top corners, a 6px band in the Plot's status colour across its top, the Plot number at 30px bold, then a status badge, a close button, a two-column definition list and facing chips. One secondary full-width action (Show on site plan).

### Motion
Motion is rare and always `motion-safe`. The sheet rises in 320ms (`sheet-up`); a Plot whose status changes on the live refresh turns over once in 700ms (`plot-flip`, a vertical squash). Both use `cubic-bezier(0.22, 1, 0.36, 1)`. Everything else is a colour or opacity transition.

## Do's and Don'ts

### Do:
- **Do** take every colour from `globals.css` tokens or the status families above; the frontmatter is normative.
- **Do** use Club Orange for actions, links, selection and active nav, and keep Book Blue for Book alone.
- **Do** print Plot numbers in the status's dark ink on every status fill.
- **Do** separate chrome with a hairline and a canvas change; lift only modals, menus and sheets.
- **Do** keep portal touch targets at 44-48px and the phone search field at 16px.
- **Do** wrap any new animation in `motion-safe` and reuse the `cubic-bezier(0.22, 1, 0.36, 1)` curve.
- **Do** use tabular numerals for every figure.

### Don't:
- **Don't** introduce a second interactive colour beyond Book Blue, or use the logo's bright #FF7844 / #E85C31 under white text.
- **Don't** add a fourth status colour or put status meaning in orange.
- **Don't** set Plot numbers in white on a status fill.
- **Don't** put a shadow on nav, headers, cards or tiles.
- **Don't** paint decorative gradients; the only gradient is the CRM nav's edge-fade mask. No edge glow or fade on the Public Portal.
- **Don't** set labels or helper text in grey; grey is the placeholder's alone.
