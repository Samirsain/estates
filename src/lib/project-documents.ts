// Public Portal & Project Layout Documents mapping (owner, 21 Nov 2026).
//
// Maps project codes to their layout plans in /public/projects. A phone will
// not draw a PDF inside a page, so each PDF also has a JPG of its one page that
// the portal shows (owner, 23 Nov 2026); the PDF stays the download.

export type ProjectLayoutDocument = {
  /** The original file, PDF or picture: what Download hands over. */
  url: string;
  /** The picture the page draws. */
  imageUrl: string;
  filename: string;
  title: string;
};

const pdf = (file: string, title: string): ProjectLayoutDocument => ({
  url: `/projects/${file}.pdf`,
  imageUrl: `/projects/${file}.jpg`,
  filename: `${file}.pdf`,
  title,
});

const CODE_DOCUMENTS: Record<string, ProjectLayoutDocument> = {
  CINEMA: pdf("CINEMA", "Riddhi Siddhi Complex Layout Plan"),
  GETOWN: pdf("GTOWN", "Ganpati Estate Town Layout Plan"),
  GTOWN: pdf("GTOWN", "Ganpati Estate Town Layout Plan"),
  PTSBNR: pdf("PTSBNR", "Pritam Town Layout Plan"),
  RSMSBNR: pdf("RSMSBNR", "Riddhi Siddhi Market Layout Plan"),
  // "7 & 13", "7_13" and "713" all normalise to this one.
  "7-13": {
    url: "/projects/7-13.jpeg",
    imageUrl: "/projects/7-13.jpeg",
    filename: "7-13.jpeg",
    title: "Sector 7 & 13 Layout Map",
  },
};

/**
 * Normalizes project codes so slight punctuation differences match reliably.
 */
export function normalizeProjectCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Finds the layout document (PDF or image) corresponding to a projectCode.
 */
export function getProjectLayoutDocument(projectCode: string | null | undefined): ProjectLayoutDocument | null {
  if (!projectCode) return null;
  const direct = CODE_DOCUMENTS[projectCode] || CODE_DOCUMENTS[projectCode.toUpperCase()];
  if (direct) return direct;

  const norm = normalizeProjectCode(projectCode);
  for (const [key, doc] of Object.entries(CODE_DOCUMENTS)) {
    if (normalizeProjectCode(key) === norm) {
      return doc;
    }
  }
  return null;
}
