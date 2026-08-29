// Shown the moment a link is clicked, while the server renders the real page.
//
// Every page here is force-dynamic and the database is a round trip away, so a
// navigation costs a few hundred milliseconds no matter how fast the queries
// are. Without this boundary the browser sits on the old page for all of it and
// the app feels stuck; with it the click responds instantly and the page
// streams in behind. It is deliberately not a copy of the shell — a skeleton
// that pretends to be the sidebar would flash and shift when the real one
// arrives.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
