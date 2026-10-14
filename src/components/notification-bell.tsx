"use client";

import React from "react";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatIst } from "@/lib/tasks";
import { recentNotifications, type Notification } from "./notifications-actions";

// "Seen" is a per-browser convenience: losing it only brings the dot back.
const SEEN_KEY = "notifications-seen-at";
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
};

/** BOOKING_APPROVED → "Booking approved". */
const label = (action: string) => action.charAt(0) + action.slice(1).toLowerCase().replaceAll("_", " ");

export function NotificationBell() {
  const [items, setItems] = React.useState<Notification[] | null>([]);
  const [seen, setSeen] = React.useState("");

  React.useEffect(() => {
    setSeen(readSeen());
    recentNotifications().then(setItems, () => setItems([]));
  }, []);

  if (items === null) return null;

  // ISO strings in one zone compare correctly as text.
  const unread = items.filter((n) => n.at > seen).length;

  return (
    <DropdownMenu
      // Saved on open, because a click on an item leaves the page before any
      // close; the highlight stays until the menu shuts.
      onOpenChange={(open) => {
        if (!items[0]) return;
        if (!open) return setSeen(items[0].at);
        try {
          localStorage.setItem(SEEN_KEY, items[0].at);
        } catch {}
      }}
    >
      <DropdownMenuTrigger
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <p className="border-b border-border/50 px-3 py-2 text-xs font-semibold">Notifications</p>
        <ul className="max-h-96 overflow-auto">
          {items.map((n) => (
            <li key={n.id} className={`border-b border-border/40 text-xs ${n.at > seen ? "bg-primary/5" : ""}`}>
              {/* Opening it is how the work gets done: the record, or the list it lives in. */}
              <a href={n.href ?? undefined} className={`block px-3 py-2 ${n.href ? "hover:bg-accent" : ""}`}>
                <p className="font-medium">
                  {label(n.action)} <span className="font-normal text-muted-foreground">· {n.entity}</span>
                </p>
                {n.reason && <p className="truncate text-muted-foreground">{n.reason}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {n.actorRef} · {formatIst(n.at)}
                </p>
              </a>
            </li>
          ))}
          {items.length === 0 && <li className="px-3 py-4 text-xs text-muted-foreground">Nothing new.</li>}
        </ul>
        <a href="/administration" className="block px-3 py-2 text-center text-xs text-primary hover:underline">
          Activity History
        </a>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
