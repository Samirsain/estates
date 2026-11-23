// The Plot drawn at its own proportions, with what each side abuts. Shared by
// the CRM Plot page and the Public Portal's Plot sheet (owner, 23 Nov 2026), so
// a buyer sees the same drawing staff do.

import { formatDimension, formatQuantity } from "@/lib/tasks";

export const SIDES = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
export type Side = (typeof SIDES)[number];
export type PlotSides = Partial<Record<Side, { label: string; open: boolean }>>;

export const BOUNDARY_KIND_LABEL: Record<string, string> = {
  ROAD: "Road",
  PLOT: "Plot",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
  PARK: "Park / Playground",
  PLAYGROUND: "Park / Playground",
  PARKING: "Parking",
  FACILITIES: "Facilities",
  PUBLIC_UTILITY: "Public Utility",
  OTHER: "Other Land",
};

/** "Road · 30 ft", "Plot · 18", "Park / Playground": what the drawing writes on a side. */
export function plotSides(
  boundaries: ReadonlyArray<{
    side: string;
    kind: string;
    roadWidthFt?: { toString(): string } | null;
    reference?: string | null;
    open: boolean;
  }>
): PlotSides {
  const sides: PlotSides = {};
  for (const b of boundaries) {
    const kind = BOUNDARY_KIND_LABEL[b.kind] ?? b.kind;
    const label =
      b.kind === "ROAD" && b.roadWidthFt
        ? `${kind} · ${formatQuantity(b.roadWidthFt.toString())} ft`
        : b.reference
          ? `${kind} · ${b.reference}`
          : kind;
    sides[b.side as Side] = { label, open: b.open };
  }
  return sides;
}

/**
 * An open side is the single emphasis, by weight rather than by a second colour.
 *
 * `narrow` is for a column a phone's width shares with text: East and West
 * labels run along their edges instead of beside them, so the drawing needs
 * little room either side and its words stay readable at that size.
 */
export function PlotShape({
  plotNumber,
  widthFt,
  lengthFt,
  sides,
  narrow = false,
}: {
  plotNumber: string;
  widthFt: string;
  lengthFt: string;
  sides: PlotSides;
  narrow?: boolean;
}) {
  const w = Number(widthFt);
  const l = Number(lengthFt);
  if (!(w > 0) || !(l > 0)) return null;

  // East and West labels sit beside the shape, where the margin is all the room
  // they have. A long one ("Park / Playground · Central Park P-1") breaks at its
  // " · " and the margin widens to its longest line, so it stays in the card.
  // ponytail: ~7 units a character at 12px is an estimate, not a measurement.
  const CHAR = 7;
  const along = (side: Side) => narrow && (side === "EAST" || side === "WEST");
  const rows = (side: Side) => {
    const label = sides[side]?.label;
    if (!label) return [];
    const beside = side === "EAST" || side === "WEST";
    return beside && !narrow && label.length * CHAR > 108 ? label.split(" · ") : [label];
  };
  const widest = narrow ? 0 : Math.max(0, ...[...rows("EAST"), ...rows("WEST")].map((row) => row.length));

  // The Plot drawn 30% smaller than it was (owner, 28 Oct 2026). Only the
  // shape shrinks: the side labels keep their size, so they stay readable.
  // A sheet's column draws it a fifth smaller again, so it sits beside the text
  // rather than towering over it.
  const scale = (narrow ? 118 : 147) / Math.max(w, l);
  // A narrow Plot is drawn just wide enough for its number to clear the two
  // length labels standing inside its east and west edges (~22 units in each),
  // so "AH-05" never sits on "60 ft"; a shallow one just tall enough for it to
  // clear the width labels above and below.
  // ponytail: ~9.5 units a character at 15px bold is an estimate, not a measurement.
  const bw = Math.max(62, w * scale, plotNumber.length * 9.5 + 44);
  const bh = Math.max(64, l * scale);
  // North and south labels are centred over the shape; a long one widens the
  // margins rather than running out of the card.
  const across = Math.max(0, ...[...rows("NORTH"), ...rows("SOUTH")].map((row) => row.length * CHAR));
  const padX = Math.max(narrow ? 48 : 150, 42 + widest * CHAR, (across - bw) / 2 + 8);
  const padY = narrow ? 44 : 52;
  const x = padX;
  const y = padY;
  const x2 = x + bw;
  const y2 = y + bh;
  const cx = x + bw / 2;
  const cy = y + bh / 2;

  const edge = {
    NORTH: { x1: x, y1: y, x2, y2: y },
    SOUTH: { x1: x, y1: y2, x2, y2 },
    WEST: { x1: x, y1: y, x2: x, y2 },
    EAST: { x1: x2, y1: y, x2, y2 },
  } as const;

  const marks = {
    NORTH: { letter: [cx, y - 14], label: [cx, y - 34], anchor: "middle", turn: 0 },
    SOUTH: { letter: [cx, y2 + 16], label: [cx, y2 + 36], anchor: "middle", turn: 0 },
    WEST: { letter: [x - 14, cy], label: [x - 30, cy], anchor: "end", turn: -90 },
    EAST: { letter: [x2 + 14, cy], label: [x2 + 30, cy], anchor: "start", turn: 90 },
  } as const;

  const spoken = SIDES.filter((side) => sides[side])
    .map((side) => `${side.toLowerCase()} ${sides[side]!.label}`)
    .join(", ");

  return (
    <figure className="m-0 w-full">
      <svg
        viewBox={`0 0 ${bw + padX * 2} ${bh + padY * 2}`}
        // Never drawn wider than its own units, so a wide card does not
        // enlarge it back to the size it was cut down from.
        style={{ maxWidth: `${bw + padX * 2}px` }}
        className="mx-auto block h-auto w-full overflow-visible text-foreground"
        role="img"
        aria-label={`Plot ${plotNumber}, ${widthFt} by ${lengthFt} feet${spoken ? `, bounded by ${spoken}` : ""}`}
      >
        {SIDES.map((side) => (
          <line
            key={side}
            {...edge[side]}
            strokeWidth={sides[side]?.open ? 3 : 1.5}
            className={sides[side]?.open ? "stroke-current" : "stroke-border"}
          />
        ))}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[15px] font-bold tabular-nums"
        >
          {plotNumber}
        </text>
        {/* Width along the north and south edges, length along east and west,
            just inside the lines they measure. */}
        {(
          [
            [cx, y + 14, 0, widthFt],
            [cx, y2 - 14, 0, widthFt],
            [x + 14, cy, -90, lengthFt],
            [x2 - 14, cy, 90, lengthFt],
          ] as const
        ).map(([tx, ty, rotate, ft], i) => (
          <text
            key={i}
            x={tx}
            y={ty}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={rotate ? `rotate(${rotate} ${tx} ${ty})` : undefined}
            className="text-[11px] font-medium tabular-nums text-foreground/75"
            fill="currentColor"
          >
            {/* 23' 2", as the Plot's size reads everywhere else (owner, 18 Nov 2026). */}
            {formatDimension(ft)}
          </text>
        ))}
        {/* The compass letter on each side, and what that side abuts just
            beyond it. */}
        {SIDES.map((side) => {
          const mark = marks[side];
          const [lx, ly] = mark.label;
          return (
            <g key={side}>
              <text
                x={mark.letter[0]}
                y={mark.letter[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-current text-[13px] font-bold"
              >
                {side.charAt(0)}
              </text>
              {sides[side] && (
                <text
                  x={lx}
                  y={ly - (rows(side).length - 1) * 7}
                  textAnchor={along(side) ? "middle" : mark.anchor}
                  dominantBaseline="middle"
                  transform={along(side) ? `rotate(${mark.turn} ${lx} ${ly})` : undefined}
                  className="text-[12px] font-medium text-foreground/75"
                  fill="currentColor"
                >
                  {rows(side).map((row, i) => (
                    <tspan key={i} x={lx} dy={i ? 14 : 0}>
                      {row}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        Plot {plotNumber} at its own proportions, with what each side abuts.
      </figcaption>
    </figure>
  );
}
