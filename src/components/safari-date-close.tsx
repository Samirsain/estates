"use client";

// Safari on a Mac keeps a date field's calendar open after a day is picked —
// on purpose, to match macOS (WebKit bug 216515). On a Mac the calendar would
// not go away, and the next click on another field only closed it, so that
// field looked dead (owner, 24 Nov 2026). Taking focus off the field closes
// the calendar, as Chrome does on a pick. A date being typed keeps its focus:
// only a change with no key pressed just before it counts as a pick.
//
// macOS only: an iPhone or iPad (touch points) has its own picker, which a
// blur would shut mid-choice.

import { useEffect } from "react";

const isDate = (t: EventTarget | null): t is HTMLInputElement =>
  t instanceof HTMLInputElement && t.type === "date";

export function SafariDateClose() {
  useEffect(() => {
    if (!navigator.vendor.startsWith("Apple") || navigator.maxTouchPoints > 0) return;
    let typedAt = -Infinity;
    const onKey = (e: KeyboardEvent) => {
      if (isDate(e.target)) typedAt = e.timeStamp;
    };
    const onChange = (e: Event) => {
      if (isDate(e.target) && e.timeStamp - typedAt > 1000) e.target.blur();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("change", onChange);
    };
  }, []);
  return null;
}
