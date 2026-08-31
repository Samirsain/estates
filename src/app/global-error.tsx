"use client";

// The boundary above the root layout — the one error.tsx cannot catch.
//
// error.tsx sits inside the layout, so an error thrown by the layout itself
// takes the layout down with it and never reaches that boundary. This replaces
// the whole document instead, which is why it carries its own <html> and
// <body>: at this point there is no layout left to render into.
//
// Deliberately plain. It cannot rely on globals.css having loaded or on any
// component that might be part of what just failed, so the few styles it needs
// are inline. As in error.tsx, the stack trace stays on the server — this
// application holds Aadhaar, PAN and bank data — and only the digest is shown,
// so a support call can be matched to the server log.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          background: "#ffffff",
          color: "#1d1d1f",
          font: "15px/1.47 system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            border: "1px solid #e0e0e0",
            borderRadius: "20px",
            padding: "1.25rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
            The application could not start
          </h1>

          <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#7a7a7a" }}>
            Nothing was half-saved — a command either finishes completely or is rolled back, so your
            records are as they were before you tried.
          </p>

          <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#7a7a7a" }}>
            Reload the page. If it keeps happening, give your administrator the reference below so
            they can find it in the server log.
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem",
                borderRadius: "12px",
                background: "#f5f5f7",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
              }}
            >
              {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              height: "2.5rem",
              padding: "0 22px",
              border: 0,
              borderRadius: "9999px",
              background: "#c1471a",
              color: "#ffffff",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
