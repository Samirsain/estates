"use client";

// The one City field, on every form that asks for a city (owner, 17 Nov 2026).
// Suggestions come from the City Master once something is typed — searched on
// the server, so the list can grow without any page shipping it — A to Z. Like PersonPicker
// it submits through a hidden `name` for FormData forms, or reports through
// `onChange` for the ones that hold state. The value is the city's name, the
// text these records have always kept.

import React from "react";
import { ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cityLabel, type CityOption, type CityState } from "@/lib/domain/city";
import { addCityFromFormAction, cityStatesAction, searchCitiesAction } from "@/app/administration/city-actions";

export function CityInput({
  name,
  value,
  defaultValue,
  onChange,
  required,
  placeholder = "Select or search city",
  className,
  inputClassName,
  disabled,
  addable,
}: {
  name?: string;
  /** Controlled when given; the field keeps its own value otherwise. */
  value?: string;
  defaultValue?: string;
  onChange?: (city: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Merged over the shared Input styling, e.g. "h-9 text-xs" on the compact forms. */
  inputClassName?: string;
  disabled?: boolean;
  /** Shows + Add City under the field (owner, 24 Nov 2026, CR-031). */
  addable?: boolean;
}) {
  const [own, setOwn] = React.useState(defaultValue ?? "");
  const picked = value ?? own;
  const [chosen, setChosen] = React.useState<CityOption | null>(null);
  const [query, setQuery] = React.useState("");
  const [rows, setRows] = React.useState<CityOption[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  // A city already on the record arrives as a bare name; one lookup gives it
  // its code and state. A name typed before the list existed stays as typed.
  React.useEffect(() => {
    if (!picked || chosen?.name === picked) return;
    let live = true;
    searchCitiesAction(picked)
      .then((found) => live && setChosen(found.find((c) => c.name.toLowerCase() === picked.toLowerCase()) ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [picked, chosen?.name]);

  // A dropdown: a click opens the whole list A to Z, typing narrows it (owner,
  // 18 Nov 2026), asked a beat after the last key; a late answer to an older
  // query is dropped.
  const typing = open;
  React.useEffect(() => {
    if (!typing) return setRows(null);
    let live = true;
    const t = setTimeout(
      () =>
        searchCitiesAction(query)
          .then((found) => {
            if (!live) return;
            setRows(found);
            setFailed(false);
            setActive(0);
          })
          .catch(() => live && setFailed(true)),
      150
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, typing]);

  React.useEffect(() => {
    if (typing) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, typing]);

  function choose(city: CityOption | null) {
    setChosen(city);
    setOwn(city?.name ?? "");
    onChange?.(city?.name ?? "");
    setQuery("");
    setOpen(false);
  }

  const shown = chosen && chosen.name === picked ? cityLabel(chosen) : picked;
  const list = rows ?? [];

  return (
    <div className={className}>
    <div className="relative">
      {name && <input type="hidden" name={name} value={picked} />}
      <Input
        // Closed, the field shows the chosen city in full; blur throws away
        // anything typed and not picked, so `required` passes only on a city.
        className={cn(inputClassName, "pr-8")}
        value={open ? query : shown}
        placeholder={open && shown ? shown : placeholder}
        required={required}
        disabled={disabled}
        role="combobox"
        aria-expanded={typing}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && typing) {
            e.preventDefault();
            setActive((i) => Math.min(list.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1))));
          } else if (e.key === "Enter" && typing) {
            // Enter picks; it never submits the form out from under the list.
            e.preventDefault();
            if (list[active]) choose(list[active]);
          } else if (e.key === "Escape" && open) {
            // Closes the list only, not the dialog around it.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {picked && !required && !disabled && !open ? (
        <button
          type="button"
          aria-label="Clear city"
          onClick={() => choose(null)}
          className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}

      {typing && (
        <ul
          ref={listRef}
          role="listbox"
          // mousedown would blur the input and close the list before the click landed.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-50 mt-1 max-h-56 w-full min-w-[16rem] overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {(failed || (rows && list.length === 0)) && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {failed ? "The city list could not be reached. Try again." : "No city on the list matches that."}
            </li>
          )}
          {list.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => choose(c)}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-1.5 text-left text-xs ${i === active ? "bg-secondary" : ""}`}
              >
                <span className="font-medium text-foreground">
                  {c.name} ({c.code})
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  — {c.stateName}, {c.countryName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
      {addable && !disabled && <AddCity onAdded={choose} />}
    </div>
  );
}

/**
 * + Add City (CR-031): a city that is not on the list yet, added without
 * leaving the form. Inline rather than a dialog, because it sits inside the
 * form's own <form>: its buttons are type="button" and Enter is caught here, so
 * nothing on the form is submitted or lost. State is optional — it opens on the
 * state most cities are in.
 */
function AddCity({ onAdded }: { onAdded: (city: CityOption) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [state, setState] = React.useState("");
  const [states, setStates] = React.useState<CityState[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    if (!open || states) return;
    let live = true;
    cityStatesAction()
      .then((found) => {
        if (!live) return;
        setStates(found);
        setState((s) => s || found[0]?.stateName || "");
      })
      .catch(() => live && setStates([]));
    return () => {
      live = false;
    };
  }, [open, states]);

  async function save() {
    if (busy) return;
    if (!name.trim()) return setNote({ ok: false, text: "Enter the city name." });
    setBusy(true);
    setNote(null);
    try {
      const result = await addCityFromFormAction({ name, stateName: state || undefined }, globalThis.crypto.randomUUID());
      if (!result.ok) return setNote({ ok: false, text: result.error });
      onAdded(result.city);
      setNote({ ok: true, text: result.message });
      setName("");
      setOpen(false);
    } catch {
      setNote({ ok: false, text: "The city could not be added. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setNote(null);
          }}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          + Add City
        </button>
        {note && <span className={`text-[11px] ${note.ok ? "text-muted-foreground" : "text-red-700"}`}>{note.text}</span>}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-secondary/40 p-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          autoFocus
          className="h-8 text-xs"
          placeholder="City name"
          aria-label="New city name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="State (optional)"
          value={state}
          onChange={(e) => setState(e.target.value)}
          disabled={!states?.length}
        >
          {!states && <option value="">Loading states…</option>}
          {states?.map((s) => (
            <option key={`${s.stateName}|${s.countryName}`} value={s.stateName}>
              {s.stateName}, {s.countryName}
            </option>
          ))}
        </select>
      </div>
      {note && !note.ok && <p className="text-[11px] text-red-700">{note.text}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="xs" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" size="xs" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
