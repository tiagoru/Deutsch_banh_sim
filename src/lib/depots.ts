import { STATION } from "./network";
import { fleetOf } from "./rotation";

export type Depot = { id: string; name: string; station: string; capacity: number };
/** Main reserve depots (schematic, inspired by real DB Betriebswerke). */
export const DEPOTS: Depot[] = [
  { id: "ham", name: "Hamburg-Eidelstedt", station: "Hamburg", capacity: 2 },
  { id: "ber", name: "Berlin-Rummelsburg", station: "Berlin", capacity: 2 },
  { id: "kln", name: "Köln-Deutzerfeld", station: "Köln", capacity: 2 },
  { id: "ffm", name: "Frankfurt-Griesheim", station: "Frankfurt", capacity: 2 },
  { id: "muc", name: "München-Pasing", station: "München", capacity: 2 },
  { id: "lpz", name: "Leipzig", station: "Leipzig", capacity: 1 },
  { id: "han", name: "Hannover", station: "Hannover", capacity: 1 },
  { id: "stg", name: "Stuttgart-Rosenstein", station: "Stuttgart", capacity: 1 },
];
/** Stock key per depot and fleet: long-distance units under the depot id, regional units under `id:regio`. */
export const stockKey = (depot: string, product = "nationalExpress") => (fleetOf(product) === "long" ? depot : `${depot}:regio`);
export const initialStock = (): Record<string, number> => Object.fromEntries(DEPOTS.flatMap(d => [[d.id, d.capacity], [`${d.id}:regio`, d.capacity]]));

/** Fixed preparation time (crew, coupling, platform slot) before leaving the depot. */
export const PREP_MIN = 12;
const DEADHEAD_KMH = 100;
export const PASSENGERS: Record<string, number> = { nationalExpress: 450, national: 320, regionalExpress: 220, regional: 160, suburban: 140 };

function km(a: string, b: string): number {
  const p = STATION[a], q = STATION[b];
  if (!p || !q) return Infinity;
  const r = Math.PI / 180;
  const h = Math.sin((q.lat - p.lat) * r / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin((q.lon - p.lon) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25; // rail detour factor
}
/** Minutes passengers wait at `station` for a reserve from `depot`. */
export const dispatchMinutes = (depot: Depot, station: string) => Math.round(PREP_MIN + (km(depot.station, station) / DEADHEAD_KMH) * 60);

/** Nearest depot (by arrival time) that still has a reserve train, or null if none left. */
export function pickDepot(station: string, stock: Record<string, number>, product = "nationalExpress"): { depot: Depot; wait: number; key: string } | null {
  let best: { depot: Depot; wait: number; key: string } | null = null;
  for (const d of DEPOTS) {
    const key = stockKey(d.id, product);
    if ((stock[key] ?? 0) <= 0) continue;
    const wait = dispatchMinutes(d, station);
    if (!best || wait < best.wait) best = { depot: d, wait, key };
  }
  return best;
}

export type Dispatch = { trainId: string; name: string; station: string; depot: string | null; wait: number; delayAvoided: number; passengers: number; kind?: "reserve" | "transfer" | "cancel" | "reset"; stockKey?: string };
export const recentDispatches = (dispatches: Dispatch[]): Dispatch[] => dispatches.slice(-6).reverse();
/** Net passenger-minutes saved: delay the onboard passengers no longer carry minus the wait for the reserve. Cancelled (no reserve) = full loss of one hourly connection. */
export const netPassengerMinutes = (d: Dispatch) => d.kind === "transfer" || d.depot ? d.passengers * (d.delayAvoided - d.wait) : -d.passengers * 60;

/** Typical interval (min) until the next regular train of the same product on the line. */
export const HEADWAY: Record<string, number> = { nationalExpress: 60, national: 120, regionalExpress: 60, regional: 60, suburban: 20 };
export type OptionKind = "keep" | "reserve" | "transfer";
export type Option = { kind: OptionKind; wait: number; net: number; available: boolean; note: string };
/** Compare keeping the train, calling a reserve, or moving passengers to the next regular train. Net = passenger-minutes saved vs. keeping. */
export function suggestOptions(station: string, product: string, ownDelay: number, stock: Record<string, number>): { options: Option[]; best: OptionKind } {
  const pax = PASSENGERS[product] ?? 200;
  const pick = pickDepot(station, stock, product);
  const headway = HEADWAY[product] ?? 60;
  const options: Option[] = [
    { kind: "keep", wait: 0, net: 0, available: true, note: `continues with ${ownDelay} min delay` },
    pick ? { kind: "reserve", wait: pick.wait, net: pax * (ownDelay - pick.wait), available: true, note: `reserve from ${pick.depot.station}, uses 1 reserve train` }
         : { kind: "reserve", wait: 0, net: -Infinity, available: false, note: "no depot has an available reserve" },
    { kind: "transfer", wait: headway, net: pax * (ownDelay - headway), available: true, note: `next regular service in ~${headway} min, no reserve used` },
  ];
  const best = options.filter(o => o.available).reduce((a, b) => (b.net > a.net ? b : a)).kind;
  return { options, best };
}
