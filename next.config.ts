import type { NextConfig } from "next";

// Common headers. Production HTML gets a per-request CSP from middleware.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  ...(process.env.NODE_ENV === "development" ? [{
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // `next dev` compiles chunks with eval-source-map, so without
      // 'unsafe-eval' nothing hydrates locally — the page sits on its loading
      // state forever. The production bundle has no eval, so it stays strict.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      // The CRM talks to its own origin only. No third-party analytics exists,
      // and Aadhaar/PAN must never leave it (PRD RD-05).
      "connect-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  }] : []),
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
  images: { dangerouslyAllowSVG: false },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Payment trial (revised brief §8): the private calculator page is never cached.
      { source: "/payment-calculator", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
    ];
  },
  // The Public Portal moved from /p to /public (owner, 23 Nov 2026). Links
  // already sent on WhatsApp still open.
  async redirects() {
    return [
      { source: "/p", destination: "/public", permanent: true },
      { source: "/p/:slug", destination: "/public/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
