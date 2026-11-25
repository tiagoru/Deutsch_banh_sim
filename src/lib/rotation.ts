import type { Train } from "./sim";

/** Estimated turnaround buffer (min) at the terminal before the same unit runs its next service. Model values, not DB Umlaufpläne. */
export const TURNAROUND: Record<string, number> = { nationalExpress: 30, national: 25, regionalExpress: 20, regional: 20, suburban: 10 };
export const turnaroundOf = (product: string) => TURNAROUND[product] ?? 20;

/** Folgeverspätung: delay left over after the turnaround buffer is used up. */
export const inheritedDelay = (arrivalDelay: number, product: string) => Math.max(0, Math.round((arrivalDelay - turnaroundOf(product)) * 10) / 10);

/** Long-distance units only replace long-distance services; regional only regional. */
export const fleetOf = (product: string): "long" | "regio" => (product === "nationalExpress" || product === "national" ? "long" : "regio");

/** Estimated number of the unit's next service (opposite direction). */
export function nextServiceName(name: string): string {
  const m = name.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${name} (volta)`;
  const n = Number(m[2]);
  return `${m[1]}${n % 2 ? n + 1 : n - 1}`;
}

export type NextService = { name: string; from: string; to: string; buffer: number; inherited: number };
export function nextService(t: Train, arrivalDelay: number): NextService {
  return { name: nextServiceName(t.name.replace(/S$/, "")), from: t.route.stations.at(-1)!, to: t.route.stations[0]!, buffer: turnaroundOf(t.product), inherited: inheritedDelay(arrivalDelay, t.product) };
}
