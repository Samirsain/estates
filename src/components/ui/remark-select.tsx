"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { REMARK_PRESETS, type RemarkPresetKey } from "@/lib/remark-presets";

const OTHER = "__other__";
const fieldClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * A remark or reason box as a drop-down of its presets, plus "Other" for the
 * rare case staff must type. Works inside a plain form (`name` posts the
 * picked or typed text, `defaultValue` prefills it) or controlled (`value` /
 * `onChange`).
 *
 * `kind` keeps only the presets for one decision — "Approved" shows the
 * "Approved — …" ones — so an Approve screen never offers a rejection remark.
 */
export function RemarkSelect({
  presets,
  name,
  value,
  defaultValue,
  onChange,
  required,
  kind,
  className,
  disabled,
}: {
  presets: RemarkPresetKey;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  kind?: string;
  className?: string;
  disabled?: boolean;
}) {
  const all: readonly string[] = REMARK_PRESETS[presets];
  const options = kind ? all.filter((o) => o.startsWith(`${kind} — `)) : all;
  const split = (v: string | undefined): [string, string] =>
    !v ? ["", ""] : options.includes(v) ? [v, ""] : [OTHER, v];

  const [[choice, text], setState] = React.useState(() => split(value ?? defaultValue));
  const current = choice === OTHER ? text : choice;
  // The parent cleared or replaced the value (a reset after save): follow it.
  if (value !== undefined && value !== current) setState(split(value));

  const set = (c: string, t: string) => {
    setState([c, t]);
    onChange?.(c === OTHER ? t : c);
  };

  return (
    <div className="space-y-1.5">
      <select
        value={choice}
        required={required}
        disabled={disabled}
        onChange={(e) => set(e.target.value, text)}
        className={cn(fieldClass, className)}
      >
        <option value="">{required ? "Pick one" : "None"}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>Other</option>
      </select>
      {choice === OTHER && (
        <input
          autoFocus
          value={text}
          required={required}
          minLength={required ? 3 : undefined}
          disabled={disabled}
          placeholder="Type it here"
          onChange={(e) => set(OTHER, e.target.value)}
          className={cn(fieldClass, className)}
        />
      )}
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );
}
