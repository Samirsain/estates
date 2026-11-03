import React from "react";

/**
 * Opens a page's own dialog from a plain `<a href="#name">` elsewhere on the
 * same page (owner, 3 Nov 2026: the Member profile's Payout buttons open
 * Update RERA, Remove Hold, Reactivate and Edit). The hash is cleared once
 * read, so the same link opens the dialog again next time.
 */
export function useHashOpen(name: string, open: () => void) {
  const latest = React.useRef(open);
  latest.current = open;
  React.useEffect(() => {
    const check = () => {
      if (window.location.hash !== `#${name}`) return;
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      latest.current();
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [name]);
}
