// The published Terms and Privacy Notice — Terms §2.1.
//
// The document itself lives in the repository, at system/change-requests, and
// is read from there rather than copied into a TypeScript string: one source of
// truth means a legal correction is a document edit, not a code edit.

import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The published version. Bump it when the document changes in a way a Member
 * should re-accept; every Member is asked again and the old acceptance rows
 * stay exactly as they were, saying what was agreed and when.
 */
export const MEMBER_TERMS_VERSION = "2026-08-22";

const TERMS_PATH = path.join(process.cwd(), "system", "change-requests", "3%_T&C.md");

export type TermsBlock =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] };

/**
 * The document numbers its own sections ("2.1 Parties and acceptance") and only
 * sometimes marks them with #, so a general Markdown renderer would read most
 * headings as body text. This reads the numbering, which is the structure the
 * document actually has, and needs no dependency to do it.
 */
export function parseTerms(source: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flushBullets = () => {
    if (bullets.length > 0) blocks.push({ kind: "bullets", items: bullets });
    bullets = [];
  };
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flush = () => {
    flushBullets();
    flushParagraph();
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();

    if (line === "") {
      flush();
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      bullets.push(line.slice(2).trim());
      continue;
    }

    // "## 2.5 What a Member may not do" and plain "2.5 What a Member may not do"
    // are the same thing in this document; the hashes are inconsistent.
    const marked = line.replace(/^#{1,6}\s*/, "");
    // "2. Member Terms & Conditions" and "2.5 What a Member may not do".
    // The capital is required so a sentence opening with a figure — "3 days
    // from the request" — is not mistaken for a clause number.
    const numbered = marked.match(/^(\d+)(\.\d+)?\.?\s+([A-Z].*)$/);
    if (numbered) {
      flush();
      const [, part, decimal, rest] = numbered;
      blocks.push({
        kind: "heading",
        level: decimal ? 2 : 1,
        text: decimal ? `${part}${decimal} ${rest}` : `${part}. ${rest}`,
      });
      continue;
    }
    if (line !== marked) {
      flush();
      blocks.push({ kind: "heading", level: 2, text: marked });
      continue;
    }

    flushBullets();
    paragraph.push(line);
  }

  flush();
  return blocks;
}

/** The whole document, parsed. Read once per request; it is a static file. */
export function readTerms(): TermsBlock[] {
  return parseTerms(readFileSync(TERMS_PATH, "utf8"));
}
