import type { NextConfig } from "next";

/**
 * Response headers for every route — ARCHITECTURE §9; PRD §27 gate 8.
 *
 * ponytail: the script policy allows 'unsafe-inline' because Next.js injects an
 * inline bootstrap on every page. Tightening it to a nonce needs a middleware
 * that generates one per request and threads it through the framework; do that
 * if a security review asks for a strict CSP.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      // The CRM talks to its own origin only. No third-party analytics exists,
      // and Aadhaar/PAN must never leave it (PRD RD-05).
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  /*
   * `next dev` and `next build` both write to .next, and a build run against a
   * running dev server overwrites the manifests that server is reading — which
   * it reports as "missing required error components, refreshing…" and then
   * dies. A verification build sets NEXT_DIST_DIR and gets its own directory,
   * so the two never share a folder. Unset in deployment, so the deploy is
   * exactly as it was.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // The CRM is internal software; the header leaks the framework version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
