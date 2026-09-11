// One Project, written as a PDF the browser downloads directly.
//
// Text, not a screenshot: the page is drawn from the same facts the dialog
// shows, so the file is a few kilobytes, the text is selectable and searchable,
// and it prints the same on any machine. jsPDF is imported where it is used —
// dynamically — so a screen that never shares a Project never loads it.
//
// Same blocks in the same order as the dialog, with one difference: the Plot
// Location Charge is not here. This file is handed to customers and brokers,
// and the rates behind a price are the office's own working, not theirs.
//
// The page is A4 wide and only as tall as what is on it. A Project with two
// amenities used to arrive as a full A4 sheet two-thirds empty, which reads on
// a phone as a document that failed to load the rest of itself. Drawing twice
// is what buys that: once to find out how tall the content is, then again on a
// page cut to that height.

export type ProjectSheet = {
  name: string;
  projectCode: string;
  type: string;
  status: string;
  developer: string | null;
  reraNumber: string | null;
  city: string | null;
  location: string | null;
  locationUrl: string | null;
  driveUrl: string | null;
  renderUrl: string | null;
  plotCount: number;
  plotTypeCounts: Array<{ label: string; count: number }>;
  amenities: string[];
};

/** A4's width, so it still prints on A4 paper. The height is the content's. */
const PAGE_WIDTH = 210;
const MARGIN = 16;
const COLUMN_GAP = 10;
const LINE = 5.6;
/* --primary in globals.css, hsl(16 76% 43%), as the RGB a PDF works in. */
const LINK_TEXT: [number, number, number] = [193, 71, 26];
const LINK_BORDER: [number, number, number] = [232, 196, 181];

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2;
const LEFT = MARGIN;
const RIGHT = MARGIN + COLUMN_WIDTH + COLUMN_GAP;

type Doc = import("jspdf").jsPDF;

export async function downloadProjectSheet(sheet: ProjectSheet): Promise<void> {
  const { jsPDF } = await import("jspdf");

  // First pass on a throwaway page, only to learn the height. Nothing here is
  // saved, so an overrun off the bottom of it costs nothing.
  const probe = new jsPDF({ unit: "mm", format: "a4" });
  const height = draw(probe, sheet);

  // jsPDF reorders a [width, height] format to match the orientation, so a
  // page shorter than it is wide has to say landscape or it comes back turned
  // on its side.
  const doc = new jsPDF({
    unit: "mm",
    orientation: height >= PAGE_WIDTH ? "portrait" : "landscape",
    format: [PAGE_WIDTH, height],
    compress: true,
  });
  draw(doc, sheet);
  doc.save(`${fileName(sheet.name, sheet.projectCode)}.pdf`);
}

/** Draws the whole sheet and returns the page height it needs. */
function draw(doc: Doc, sheet: ProjectSheet): number {
  let y = MARGIN;

  /* ------------------------------------------------------------- header */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(
    [sheet.projectCode, sheet.type, sheet.status].filter(Boolean).join("  ·  ").toUpperCase(),
    LEFT,
    y
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(20);
  doc.text(sheet.name, LEFT, y + 8);

  y += 12;
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.line(LEFT, y, PAGE_WIDTH - MARGIN, y);
  y += 7;

  /* ------------------------------------------------ where | responsibility */
  const whereUsed = group(doc, LEFT, y, "Where", [
    ["City", sheet.city ?? "Not recorded"],
    ["Location", sheet.location ?? "Not recorded"],
  ]);
  const whoUsed = group(doc, RIGHT, y, "Responsibility", [
    ["Developer", sheet.developer ?? "Not recorded"],
    ["RERA Number", sheet.reraNumber ?? "Not recorded"],
  ]);
  y += Math.max(whereUsed, whoUsed) + 4;

  /* ------------------------------------------------------------ inventory */
  y += group(doc, LEFT, y, "Inventory", [
    ["Total Plots", String(sheet.plotCount)],
    ...sheet.plotTypeCounts.map(
      ({ label, count }) => [label, String(count)] as [string, string]
    ),
  ]);
  y += 4;

  /* --------------------------------------------------------------- links */
  // The three buttons the screen has, in the screen's order and in the
  // screen's place — under the inventory they describe — as the thing a PDF
  // can carry: a pill you click. A link that was never added prints nothing
  // rather than a dead pill.
  const links = [
    { label: "Layout", url: sheet.driveUrl },
    { label: "Location", url: sheet.locationUrl },
    { label: "3D Visuals", url: sheet.renderUrl },
  ].filter((link): link is { label: string; url: string } => Boolean(link.url));

  doc.setFontSize(9);
  if (links.length) {
    let x = LEFT;
    for (const link of links) {
      const width = doc.getTextWidth(link.label) + 10;
      // The same pill the screen draws: the brand's own colour on a white
      // ground, not a grey box that reads as disabled once printed.
      doc.setDrawColor(...LINK_BORDER);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y - 4.4, width, 7.4, 3.7, 3.7, "FD");
      doc.setTextColor(...LINK_TEXT);
      doc.setFont("helvetica", "normal");
      doc.text(link.label, x + 5, y);
      doc.link(x, y - 4.4, width, 7.4, { url: link.url });
      x += width + 4;
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140);
    doc.text("No links added yet.", LEFT, y);
  }
  y += 9;

  /* ----------------------------------------------------------- amenities */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text("AMENITIES", LEFT, y);
  doc.setDrawColor(225);
  doc.line(LEFT, y + 1.8, PAGE_WIDTH - MARGIN, y + 1.8);
  y += 1.8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(40);
  if (sheet.amenities.length === 0) {
    y += LINE;
    doc.setTextColor(120);
    doc.text("None recorded.", LEFT, y);
  } else {
    const columns = 3;
    const rows = Math.ceil(sheet.amenities.length / columns);
    const cellWidth = CONTENT_WIDTH / columns;
    sheet.amenities.forEach((amenity, i) => {
      const x = LEFT + Math.floor(i / rows) * cellWidth;
      const at = y + LINE * ((i % rows) + 1);
      doc.text(`•  ${doc.splitTextToSize(amenity, cellWidth - 6)[0]}`, x, at);
    });
    y += LINE * rows;
  }

  /* -------------------------------------------------------------- footer */
  y += 7;
  doc.setDrawColor(225);
  doc.line(LEFT, y, PAGE_WIDTH - MARGIN, y);
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`${sheet.name} · ${sheet.projectCode}`, LEFT, y);
  doc.text("3% Club", PAGE_WIDTH - MARGIN, y, { align: "right" });

  return y + MARGIN - 3;
}

/** A heading and its rows in one column, returning the height it used. */
function group(
  doc: Doc,
  x: number,
  top: number,
  title: string,
  rows: Array<[string, string]>
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(title.toUpperCase(), x, top);

  doc.setDrawColor(225);
  doc.setLineWidth(0.3);
  doc.line(x, top + 1.8, x + COLUMN_WIDTH, top + 1.8);

  let y = top + 1.8;
  doc.setFontSize(9.5);
  for (const [label, value] of rows) {
    y += LINE;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(label, x, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text(value, x + COLUMN_WIDTH, y, { align: "right" });
  }
  return y - top + 3;
}

/** A file name a file manager will accept on every platform. */
function fileName(name: string, code: string): string {
  return `${name} ${code}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}
