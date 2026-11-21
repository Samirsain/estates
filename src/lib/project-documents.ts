// Public Portal & Project Layout Documents mapping (owner, 21 Nov 2026).
//
// Maps project codes to their respective layout maps and architectural documents
// (PDF blueprints and high-resolution layout images) placed in /public/projects.

export type ProjectLayoutDocument = {
  url: string;
  type: "pdf" | "image";
  filename: string;
  title: string;
};

const CODE_DOCUMENTS: Record<string, ProjectLayoutDocument> = {
  CINEMA: {
    url: "/projects/CINEMA.pdf",
    type: "pdf",
    filename: "CINEMA.pdf",
    title: "Riddhi Siddhi Complex Layout Plan",
  },
  GETOWN: {
    url: "/projects/GTOWN.pdf",
    type: "pdf",
    filename: "GTOWN.pdf",
    title: "Ganpati Estate Town Layout Plan",
  },
  GTOWN: {
    url: "/projects/GTOWN.pdf",
    type: "pdf",
    filename: "GTOWN.pdf",
    title: "Ganpati Estate Town Layout Plan",
  },
  PTSBNR: {
    url: "/projects/PTSBNR.pdf",
    type: "pdf",
    filename: "PTSBNR.pdf",
    title: "Pritam Town Layout Plan",
  },
  RSMSBNR: {
    url: "/projects/RSMSBNR.pdf",
    type: "pdf",
    filename: "RSMSBNR.pdf",
    title: "Riddhi Siddhi Market Layout Plan",
  },
  "7 & 13": {
    url: "/projects/7-13.jpeg",
    type: "image",
    filename: "7-13.jpeg",
    title: "Sector 7 & 13 Layout Map",
  },
  "7-13": {
    url: "/projects/7-13.jpeg",
    type: "image",
    filename: "7-13.jpeg",
    title: "Sector 7 & 13 Layout Map",
  },
  "7_13": {
    url: "/projects/7-13.jpeg",
    type: "image",
    filename: "7-13.jpeg",
    title: "Sector 7 & 13 Layout Map",
  },
  "713": {
    url: "/projects/7-13.jpeg",
    type: "image",
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

