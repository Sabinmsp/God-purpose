/** All money is integer cents in AUD. */
export const CURRENCY = "AUD";

const fmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: CURRENCY });
const fmtWhole = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

/** Formats cents as "A$1,234.50". */
export function formatAud(cents: number, opts: { whole?: boolean } = {}): string {
  const value = cents / 100;
  const text = (opts.whole ? fmtWhole : fmt).format(value);
  return text.startsWith("$") || text.startsWith("-$") ? text.replace("$", "A$") : text;
}

/**
 * Parses a user-typed dollar amount ("1,250.5", "$40") into cents.
 * Returns null for anything that is not a finite, non-negative amount with
 * at most two decimal places.
 */
export function parseAudToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "").replace(/^A?\$/i, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(1, part / whole));
}

/** Car garage build stages, unlocked at 10/25/50/75/100% of the car goal. */
export const CAR_STAGES = [
  { at: 0, label: "Empty lot" },
  { at: 0.1, label: "Garage foundation" },
  { at: 0.25, label: "Car frame" },
  { at: 0.5, label: "Car body" },
  { at: 0.75, label: "Painted car" },
  { at: 1, label: "Car unlocked" },
] as const;

export function carStage(progress: number): number {
  let stage = 0;
  CAR_STAGES.forEach((s, i) => {
    if (progress >= s.at) stage = i;
  });
  return stage;
}

export const VAULT_MILESTONES = [0.1, 0.25, 0.5, 0.75, 1] as const;
