// The Customers and Members lists (owner, 2 Nov 2026): a grid table edge to
// edge, every column centred, the spare width shared equally between columns.
// The <table> carries `grid grid-cols-[repeat(N,auto)]`, its thead, tbody and
// rows `contents`, and each cell one of these. Rows are `group contents`, so a
// cell reads the row's hover and last-row state.

export const LIST_TH =
  "flex items-center justify-center border-b border-border px-3 py-1.5 text-center font-semibold";

export const LIST_TD =
  "flex h-14 flex-col items-center justify-center whitespace-nowrap border-b border-border/60 px-3 text-center group-last:border-0 group-hover:bg-secondary/50";
