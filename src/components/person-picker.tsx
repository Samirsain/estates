"use client";

// One searchable picker for every place a Person, Customer or Member is chosen.
//
// Every screen already ships its whole people list to the client, so the search
// is a filter over an array that is here anyway — no round trip, no new server
// action, no dependency. It stands in for a <select>, so it keeps the two
// things the <select>s it replaces gave their callers: a `name` for the forms
// that read FormData, and a controlled value for the ones that hold state.

import React from "react";
import { inputClass } from "@/components/ui/modal";
import { matchPeople, type PickerOption } from "@/lib/domain/person-search";

export { personLabel, type PickerOption } from "@/lib/domain/person-search";

/** The id the match-or-create forms already use for "not on file yet". */
export const NEW_PERSON = "NEW";

export function PersonPicker({
  options,
  value,
  defaultValue,
  onChange,
  name,
  required,
  placeholder = "Search name, mobile, Customer ID or Member ID",
  newOptionLabel,
  className,
  disabled,
}: {
  options: PickerOption[];
  /** Controlled when given; the picker keeps its own value otherwise. */
  value?: string;
  /** Starting id for the uncontrolled forms, as a <select> defaultValue was. */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Set on the FormData forms, so the chosen id submits as the <select> did. */
  name?: string;
  required?: boolean;
  placeholder?: string;
  /** Adds a "+ New …" row returning NEW_PERSON, for match-or-create forms. */
  newOptionLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [own, setOwn] = React.useState(defaultValue ?? "");
  const picked = value ?? own;
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  const rows = React.useMemo(() => {
    const top = matchPeople(options, query);
    return newOptionLabel ? [{ id: NEW_PERSON, label: newOptionLabel }, ...top] : top;
  }, [options, query, newOptionLabel]);

  const chosen =
    picked === NEW_PERSON
      ? { id: NEW_PERSON, label: newOptionLabel ?? "" }
      : options.find((o) => o.id === picked);

  // Arrow keys must not walk the highlight out of sight.
  React.useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(id: string) {
    setOwn(id);
    onChange?.(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {name && <input type="hidden" name={name} value={picked} />}
      <input
        // The visible field holds the chosen label, and blur throws away
        // anything typed that was never picked — so `required` passes only
        // when a real option was chosen, not when a name was half-typed.
        className={inputClass}
        value={open ? query : (chosen?.label ?? "")}
        placeholder={open && chosen ? chosen.label : placeholder}
        required={required}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        // Focus alone must not open the list. A native <dialog> focuses its
        // first field on showModal(), and a picker that opens itself there
        // drops three hundred names over the rest of the form before anyone
        // has asked for one. A click, a keystroke or ArrowDown asks for it.
        onFocus={() => {
          setQuery("");
          setActive(0);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((i) =>
              Math.min(rows.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))
            );
          } else if (e.key === "Enter" && open) {
            // Never let Enter submit the form out from under an open list,
            // even when nothing matched — the id behind it would be blank.
            e.preventDefault();
            if (rows[active]) choose(rows[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && (
        <ul
          ref={listRef}
          // mousedown would blur the input and close the list before the click
          // ever landed on an option.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {rows.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Nobody on file matches that.
            </li>
          )}
          {rows.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => choose(o.id)}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  i === active ? "bg-secondary" : ""
                } ${o.id === NEW_PERSON ? "font-semibold text-primary" : "text-foreground"}`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
