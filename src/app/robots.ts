// Internal CRM — nothing here belongs in a search index. PRD §23 privacy and
// RD-05 both assume this system is reachable only by staff and Members who sign
// in; a crawled login page or a leaked URL is an avoidable start for an attack.

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
