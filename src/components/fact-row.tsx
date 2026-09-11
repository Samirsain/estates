/**
 * The label is the question and the value is the answer, so the answer is what
 * carries the weight: a mobile number, an Aadhaar, an account. `hint` is for
 * what qualifies the answer rather than being it — a verification state — and
 * stays quiet underneath. Shared, because the protected values render the same
 * row from the client once they are revealed.
 */
export function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="block text-sm font-semibold text-foreground">{value}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}
