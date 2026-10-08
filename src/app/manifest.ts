// Lets Android and iOS install the CRM to the home screen as an app. Served at
// /manifest.webmanifest; no middleware guards it, so a phone can read it before
// anyone has signed in.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "3% Club CRM",
    short_name: "3% Club CRM",
    description: "Plotted real estate CRM — enquiries, holds, bookings and payments for 3% Club.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
