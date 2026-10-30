// One Project as a one-page A4 information sheet the browser downloads
// directly (owner's sheet spec, 29 Oct 2026).
//
// Text, not a screenshot: the page is drawn from the same facts More info
// shows, so the file is a few kilobytes, the text is selectable and searchable,
// the links are live, and it prints the same on any machine. jsPDF is imported
// where it is used — dynamically — so a screen that never downloads a sheet
// never loads it.
//
// The order is the dialog's: the name line with code, status and RERA; the
// address; the type and "By" the developer; then Project Amenities, Project
// Resources, Plot Inventory and Plot Location Charges. Anything not recorded is
// left out rather than printed as a dash. The PLC rates used to be left off
// because the sheet goes to customers and brokers; the owner now wants it to
// carry what the screen does, rates included.
//
// Helvetica is the face: the spec asks for Inter with Arial as the fallback,
// and Helvetica is the PDF's built-in Arial — embedding Inter would mean
// shipping a font file the app does not have.

export type ProjectSheet = {
  name: string;
  projectCode: string;
  type: string;
  status: string;
  developer: string | null;
  reraNumber: string | null;
  /** The address line as the screen prints it (projectWhere). */
  where: string | null;
  locationUrl: string | null;
  driveUrl: string | null;
  renderUrl: string | null;
  amenities: string[];
  /** The count cards, Total Plots first; null for an External Resale Property Group. */
  inventory: Array<{ label: string; value: string }> | null;
  /** The published rates, "Road 60 ft" and "3.00%"; null when none is published. */
  plcRates: Array<{ label: string; value: string }> | null;
};

type Rgb = [number, number, number];

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const LEFT = MARGIN;
const RIGHT_EDGE = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Content stops here; the footer's rule and line sit below it. */
const FOOTER_RULE = PAGE_HEIGHT - MARGIN - 6;

const CHARCOAL: Rgb = [34, 34, 34]; // #222222
const GREY: Rgb = [107, 114, 128]; // #6B7280
const ACCENT: Rgb = [198, 90, 53]; // #C65A35, terracotta
const ACCENT_SOFT: Rgb = [238, 205, 193];
const HAIRLINE: Rgb = [229, 231, 235];
const CARD: Rgb = [249, 250, 251];
const ACTIVE_TEXT: Rgb = [4, 120, 87];
const ACTIVE_FILL: Rgb = [236, 253, 245];
const ACTIVE_BORDER: Rgb = [167, 243, 208];

const LINE = 5.6;
const COLUMNS = 3;
const CELL = CONTENT_WIDTH / COLUMNS;

type Doc = import("jspdf").jsPDF;

export async function downloadProjectSheet(sheet: ProjectSheet): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const a4 = () => new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

  // One page, always. A list of amenities too long for it is cut a row at a
  // time, on throwaway pages, until the rest fits; the last bullet then says
  // how many were left out.
  // ponytail: cuts only amenities; a Project with dozens of PLC rates as well would still overrun.
  let shown = sheet.amenities.length;
  while (shown > 1 && draw(a4(), sheet, shown) > FOOTER_RULE - 3) shown = Math.max(1, shown - COLUMNS);

  const doc = a4();
  doc.setProperties({ title: `${sheet.name} — Project Information Sheet` });
  draw(doc, sheet, shown);
  footer(doc, sheet);
  doc.save(`${fileName(sheet.name, sheet.projectCode)}.pdf`);
}

/**
 * Draws everything above the footer and returns where it ended. `y` is always
 * the baseline the next line of text goes on.
 */
function draw(doc: Doc, sheet: ProjectSheet, amenitiesShown: number): number {
  /* ------------------------------------------------------------- header */
  // RERA in the top right corner, its label over the number.
  let reraWidth = 0;
  let y = MARGIN + 7;
  if (sheet.reraNumber) {
    setText(doc, 7.5, "bold", GREY);
    doc.text("RERA NO.", RIGHT_EDGE, y - 5, { align: "right" });
    setText(doc, 10, "bold", CHARCOAL);
    doc.text(sheet.reraNumber, RIGHT_EDGE, y, { align: "right" });
    reraWidth = doc.getTextWidth(sheet.reraNumber);
  }

  // The name, with its code and status beside it. A name too long for the
  // room RERA leaves wraps rather than running under it.
  setText(doc, 9, "bold", GREY);
  const codeWidth = doc.getTextWidth(sheet.projectCode);
  setText(doc, 7.5, "bold", CHARCOAL);
  const badgeWidth = doc.getTextWidth(sheet.status) + 5;
  setText(doc, 20, "bold", CHARCOAL);
  const nameLines: string[] = doc.splitTextToSize(
    sheet.name,
    CONTENT_WIDTH - (reraWidth ? reraWidth + 10 : 0) - codeWidth - badgeWidth - 8
  );
  nameLines.forEach((line, i) => doc.text(line, LEFT, y + i * 8));
  y += (nameLines.length - 1) * 8;
  let x = LEFT + doc.getTextWidth(nameLines[nameLines.length - 1]) + 4;
  setText(doc, 9, "bold", GREY);
  doc.text(sheet.projectCode, x, y - 0.6);
  x += codeWidth + 3;
  const active = sheet.status === "Active";
  pill(doc, x, y - 0.6, sheet.status, {
    size: 7.5,
    text: active ? ACTIVE_TEXT : GREY,
    fill: active ? ACTIVE_FILL : [255, 255, 255],
    border: active ? ACTIVE_BORDER : HAIRLINE,
  });

  // The address as a subtitle, with no label of its own.
  if (sheet.where) {
    y += 6.5;
    setText(doc, 10, "normal", GREY);
    const lines: string[] = doc.splitTextToSize(sheet.where, CONTENT_WIDTH);
    doc.text(lines, LEFT, y);
    y += (lines.length - 1) * 4.6;
  }

  // The type, and "By" the developer.
  y += 8;
  const typeWidth = pill(doc, LEFT, y, sheet.type, { size: 8, text: CHARCOAL, fill: [255, 255, 255], border: HAIRLINE });
  if (sheet.developer) {
    const at = LEFT + typeWidth + 5;
    setText(doc, 9.5, "normal", GREY);
    doc.text("By", at, y);
    const by = doc.getTextWidth("By ");
    setText(doc, 9.5, "bold", CHARCOAL);
    const lines: string[] = doc.splitTextToSize(sheet.developer, CONTENT_WIDTH - typeWidth - 5 - by);
    doc.text(lines, at + by, y);
    y += (lines.length - 1) * 4.4;
  }

  y += 5.5;
  rule(doc, y);
  y += 9;

  /* ------------------------------------------------------------ amenities */
  if (sheet.amenities.length) {
    y = heading(doc, y, "Project Amenities");
    const list =
      amenitiesShown >= sheet.amenities.length
        ? sheet.amenities
        : [
            ...sheet.amenities.slice(0, amenitiesShown - 1),
            `+ ${sheet.amenities.length - amenitiesShown + 1} more`,
          ];
    y = bullets(doc, y, list.map(sentenceCase)) + 3;
  }

  /* ------------------------------------------------------------ resources */
  // Only a link that is a web address prints, as a pill you click; one never
  // added, or not a link at all, prints nothing rather than a dead pill.
  const links = [
    { label: "Layout", url: sheet.driveUrl },
    { label: "Location", url: sheet.locationUrl },
    { label: "3D Visuals", url: sheet.renderUrl },
  ].filter((link): link is { label: string; url: string } => isWebAddress(link.url));
  if (links.length) {
    y = heading(doc, y, "Project Resources");
    let at = LEFT;
    for (const link of links) {
      const width = pill(doc, at, y, link.label, { size: 9, text: ACCENT, fill: [255, 255, 255], border: ACCENT_SOFT, tall: true });
      doc.link(at, y - 5, width, 7.4, { url: link.url.trim() });
      at += width + 4;
    }
    y += 12;
  }

  /* ------------------------------------------------------------ inventory */
  if (sheet.inventory) {
    y = heading(doc, y, "Plot Inventory");
    const gap = 4;
    const count = sheet.inventory.length;
    const width = (CONTENT_WIDTH - gap * (count - 1)) / count;
    const top = y - 3.5;
    sheet.inventory.forEach(({ label, value }, i) => {
      const x = LEFT + i * (width + gap);
      doc.setDrawColor(...HAIRLINE);
      doc.setFillColor(...CARD);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, top, width, 17, 2, 2, "FD");
      setText(doc, 16, "bold", CHARCOAL);
      doc.text(value, x + 5, top + 8.5);
      setText(doc, 8.5, "normal", GREY);
      doc.text(label, x + 5, top + 13.8);
    });
    y = top + 17 + 9;
  }

  /* ------------------------------------------------------------------ PLC */
  // Two label and value pairs to a row, each pair ruled underneath.
  if (sheet.plcRates?.length) {
    y = heading(doc, y, "Plot Location Charges");
    const gap = 10;
    const half = (CONTENT_WIDTH - gap) / 2;
    for (let start = 0; start < sheet.plcRates.length; start += 2) {
      sheet.plcRates.slice(start, start + 2).forEach(({ label, value }, i) => {
        const x = LEFT + i * (half + gap);
        setText(doc, 9.5, "normal", CHARCOAL);
        doc.text(headline(label), x, y);
        setText(doc, 9.5, "bold", CHARCOAL);
        doc.text(value, x + half, y, { align: "right" });
        doc.setDrawColor(...HAIRLINE);
        doc.setLineWidth(0.2);
        doc.line(x, y + 2.6, x + half, y + 2.6);
      });
      y += 7.4;
    }
  }

  return y;
}

/** The rule, the sheet's name for itself, the developer, and the page number. */
function footer(doc: Doc, sheet: ProjectSheet) {
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(LEFT, FOOTER_RULE, RIGHT_EDGE, FOOTER_RULE);
  const y = FOOTER_RULE + 5;
  setText(doc, 8, "normal", GREY);
  doc.text("Project Information Sheet", LEFT, y);
  if (sheet.developer) doc.text(sheet.developer, PAGE_WIDTH / 2, y, { align: "center" });
  doc.text("Page 1 of 1", RIGHT_EDGE, y, { align: "right" });
}

function setText(doc: Doc, size: number, style: "normal" | "bold", colour: Rgb) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...colour);
}

/** A full-width hairline. */
function rule(doc: Doc, y: number) {
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(LEFT, y, RIGHT_EDGE, y);
}

/** A section's name, after a small terracotta bar. Returns its first line's baseline. */
function heading(doc: Doc, y: number, title: string): number {
  doc.setFillColor(...ACCENT);
  doc.rect(LEFT, y - 3.4, 1, 4.2, "F");
  setText(doc, 11, "bold", CHARCOAL);
  doc.text(title, LEFT + 3.5, y);
  return y + 8;
}

/** A label on a rounded ground, sitting on `baseline`. Returns its width. */
function pill(
  doc: Doc,
  x: number,
  baseline: number,
  label: string,
  look: { size: number; text: Rgb; fill: Rgb; border: Rgb; tall?: boolean }
): number {
  setText(doc, look.size, "bold", look.text);
  const height = look.tall ? 7.4 : 5.4;
  const width = doc.getTextWidth(label) + (look.tall ? 10 : 5);
  doc.setDrawColor(...look.border);
  doc.setFillColor(...look.fill);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, baseline - (look.tall ? 5 : 3.9), width, height, height / 2, height / 2, "FD");
  doc.text(label, x + (look.tall ? 5 : 2.5), baseline);
  return width;
}

/**
 * Bullets in three columns, filled a row at a time as the screen fills them,
 * each wrapping inside its own column. Returns the next baseline.
 */
function bullets(doc: Doc, top: number, items: string[]): number {
  let y = top;
  for (let start = 0; start < items.length; start += COLUMNS) {
    let tallest = 1;
    items.slice(start, start + COLUMNS).forEach((item, column) => {
      const x = LEFT + column * CELL;
      doc.setFillColor(...ACCENT);
      doc.circle(x + 0.8, y - 1.2, 0.6, "F");
      setText(doc, 9.5, "normal", CHARCOAL);
      const lines: string[] = doc.splitTextToSize(item, CELL - 8);
      doc.text(lines, x + 3.5, y);
      tallest = Math.max(tallest, lines.length);
    });
    y += LINE + (tallest - 1) * 4.2;
  }
  return y;
}

// The three below are the sheet's wording, and More info uses them too so the
// screen and the paper say the same thing.

/** "gated entry" prints as "Gated entry"; what is stored is untouched. */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Four side open" prints as "Four Side Open"; units and joining words stay small. */
export function headline(text: string): string {
  const small = new Set(["ft", "and", "or", "of", "the"]);
  return text
    .split(" ")
    .map((word, i) => (i > 0 && small.has(word.toLowerCase()) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Only a web address is a link worth printing; a blank or a stray word is not. */
export function isWebAddress(url: string | null): url is string {
  return Boolean(url && /^https?:\/\/\S+$/i.test(url.trim()));
}

/** A file name a file manager will accept on every platform. */
function fileName(name: string, code: string): string {
  return `${name} ${code}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}
