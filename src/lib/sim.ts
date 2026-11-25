import { EDGE, edgeMinutes, STATIONS, nearestEdge, pointOnEdge, routeMinutes, shortestRoute, type Route } from "./network";

export type Train = {
  id: string;
  name: string;
  product: string;
  direction: string;
  route: Route; // full route; train is on route.edges[edgeIdx]
  edgeIdx: number;
  frac: number;
  baseDelay: number; // own delay, minutes
  extra?: number | undefined; // minutes added/saved by rerouting
};

export type Status = "green" | "yellow" | "red";
export const statusOf = (d: number): Status => (d <= 0.5 ? "green" : d <= 10 ? "yellow" : "red");

/** Trains whose own delay is above `min` minutes. */
export const delayedOver = (min: number) => (t: Train) => t.baseDelay > min;

const LOOKAHEAD = 3; // edges ahead where trains can block each other
const SPREAD = 0.05;
const CAP = 10;

export const destination = (t: Train) => t.route.stations.at(-1)!;
export const nextStation = (t: Train) => t.route.stations[t.edgeIdx + 1]!;
export const remainingEdges = (t: Train) => t.route.edges.slice(t.edgeIdx + 1);

export function position(t: Train): [number, number] {
  return pointOnEdge(EDGE[t.route.edges[t.edgeIdx]!]!, t.route.stations[t.edgeIdx]!, t.frac);
}

/** Replace route after the next station; destination stays the same. */
export function reroute(t: Train, alt: Route): Train {
  const head = { stations: t.route.stations.slice(0, t.edgeIdx + 2), edges: t.route.edges.slice(0, t.edgeIdx + 1) };
  const oldMin = routeMinutes(remainingEdges(t));
  const newMin = routeMinutes(alt.edges);
  return {
    ...t,
    route: { stations: [...head.stations, ...alt.stations.slice(1)], edges: [...head.edges, ...alt.edges] },
    extra: Math.round(((t.extra ?? 0) + newMin - oldMin) * 10) / 10,
  };
}

/** Delayed trains block shared track: delay spreads to trains using the same upcoming segments. */
export function simulate(trains: Train[], removed: Set<string>): Map<string, number> {
  const active = trains.filter((t) => !removed.has(t.id));
  const ahead = new Map(active.map((t) => [t.id, new Set(t.route.edges.slice(t.edgeIdx, t.edgeIdx + LOOKAHEAD))]));
  const out = new Map<string, number>();
  for (const t of active) {
    const mine = ahead.get(t.id)!;
    let induced = 0;
    for (const n of active) {
      if (n === t || n.baseDelay < 5) continue;
      for (const e of ahead.get(n.id)!) if (mine.has(e)) { induced += n.baseDelay * SPREAD; break; }
    }
    const d = Math.max(0, t.baseDelay + (t.extra ?? 0) + Math.min(induced, CAP));
    out.set(t.id, Math.round(d * 10) / 10);
  }
  return out;
}

export function summarize(delays: Map<string, number>) {
  let green = 0, yellow = 0, red = 0, sum = 0;
  for (const d of delays.values()) {
    sum += d;
    const s = statusOf(d);
    if (s === "green") green++; else if (s === "yellow") yellow++; else red++;
  }
  const n = delays.size || 1;
  return { green, yellow, red, total: delays.size, avg: Math.round((sum / n) * 10) / 10, punctuality: Math.round((green / n) * 100) };
}

const PREFIX: Record<string, string> = { nationalExpress: "ICE", national: "IC", regional: "RE", suburban: "S" };

/** Synthetic dataset placed on the network (fallback when the live DB feed is unavailable). */
export function syntheticTrains(n = 180, seed = 42): Train[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const list: Train[] = [];
  let guard = 0;
  while (list.length < n && guard++ < n * 5) {
    const a = STATIONS[Math.floor(rnd() * STATIONS.length)]!.id;
    const b = STATIONS[Math.floor(rnd() * STATIONS.length)]!.id;
    if (a === b) continue;
    const route = shortestRoute(a, b);
    if (!route || route.edges.length < 2) continue;
    const long = route.edges.length >= 4;
    const product = long ? (rnd() < 0.6 ? "nationalExpress" : "national") : rnd() < 0.7 ? "regional" : "suburban";
    const r = rnd();
    const baseDelay = r < 0.62 ? 0 : r < 0.88 ? Math.ceil(rnd() * 10) : 11 + Math.floor(rnd() * 35);
    list.push({
      id: `sim-${list.length}`,
      name: `${PREFIX[product]} ${100 + Math.floor(rnd() * 900)}`,
      product,
      direction: b,
      route,
      edgeIdx: Math.floor(rnd() * (route.edges.length - 1)),
      frac: rnd(),
      baseDelay,
    });
  }
  return list;
}

export async function fetchLiveTrains(): Promise<Train[]> {
  const url = "https://v6.db.transport.rest/radar?north=55.1&west=5.8&south=47.2&east=15.1&results=512&frames=1&polylines=false";
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const movements: any[] = json.movements ?? json;
    const trains = movements
      .filter((m) => m.location?.latitude && m.line?.product !== "bus")
      .map((m): Train => {
        const next = (m.nextStopovers ?? []).find((x: any) => x.arrivalDelay != null || x.departureDelay != null);
        const sec = next ? (next.arrivalDelay ?? next.departureDelay ?? 0) : 0;
        const e = nearestEdge(m.location.latitude, m.location.longitude);
        return {
          id: m.tripId, name: m.line?.name ?? "?", product: m.line?.product ?? "regional", direction: m.direction ?? "",
          route: { stations: [e.a, e.b], edges: [e.id] }, edgeIdx: 0, frac: 0.5, baseDelay: Math.max(0, Math.round(sec / 60)),
        };
      });
    if (!trains.length) throw new Error("empty");
    return trains;
  } finally {
    clearTimeout(to);
  }
}

/** Move a train along its route by `min` simulated minutes; at the end it turns back. */
export function advance(t: Train, min: number): Train {
  let { edgeIdx, frac, route } = t;
  let left = min;
  for (let guard = 0; left > 0 && guard < 50; guard++) {
    const m = Math.max(0.5, edgeMinutes(EDGE[route.edges[edgeIdx]!]!));
    const need = (1 - frac) * m;
    if (left < need) { frac += left / m; left = 0; break; }
    left -= need; frac = 0; edgeIdx++;
    if (edgeIdx >= route.edges.length) {
      route = { stations: [...route.stations].reverse(), edges: [...route.edges].reverse() };
      edgeIdx = 0;
    }
  }
  return { ...t, route, edgeIdx, frac, direction: route === t.route ? t.direction : route.stations.at(-1)! };
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Weekday load factor: rush days get more delay, weekends less. */
export const DAY_FACTOR = [1.15, 1, 1, 1.05, 1.3, 0.75, 0.6];

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Draw a train's own delay for simulated day `day` (0 = Monday), deterministic per train+day. */
export function delayForDay(id: string, day: number): number {
  let s = (hash(id) ^ (day * 2654435761)) >>> 0 || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  rnd();
  const f = DAY_FACTOR[day % 7]!;
  const r = rnd();
  if (r < 1 - 0.38 * f) return 0;
  if (r < 1 - 0.12 * f) return Math.ceil(rnd() * 10);
  return 11 + Math.floor(rnd() * 35 * f);
}

/** Replacement train that takes over at the station the original stopped at, on time. */
export function replacementFor(t: Train, atIdx: number): Train | null {
  if (atIdx >= t.route.edges.length) return null;
  return { ...t, id: `${t.id}-sub`, name: `${t.name}S`, edgeIdx: atIdx, frac: 0, baseDelay: 0, extra: 0 };
}
