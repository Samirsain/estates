// Site plans the Public Portal draws, keyed by Project code (owner, 30 Oct 2026).
//
// Each one is traced from the architect's layout PDF: every Plot is its own
// width × depth in feet at the plan's scale (pixels per foot), and roads, park
// and other open areas are their stated sizes. A Plot is matched to the CRM's
// Plot by number, and its colour comes from that Plot's live status.
//
// ponytail: one file per Project, added by hand from the PDF; an upload and a
// place-the-Plots editor on the Project page when Projects need it without a developer.

import gee from "./gee.json";

export type SiteLayout = {
  /** Plan pixels per foot. */
  scale: number;
  viewBox: [number, number, number, number];
  roads: { points: number[][]; label: string; x: number; y: number; rotate?: number }[];
  areas: { kind: string; x: number; y: number; w: number; h: number; label: string; rotate?: number }[];
  plots: { number: string; points: number[][]; x: number; y: number; small?: boolean }[];
  /** Where a road leads, written on it ("SANGARIA →"). */
  notes?: { text: string; x: number; y: number; rotate?: number }[];
};

const LAYOUTS: Record<string, SiteLayout> = {
  GEE: gee as SiteLayout,
};

export function siteLayout(projectCode: string): SiteLayout | null {
  return LAYOUTS[projectCode] ?? null;
}
