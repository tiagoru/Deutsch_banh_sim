// Parse a HAFAS JourneyGeoPos response into simulator trains (pure, browser-safe).
import { STATION, STATIONS, nearestEdge, shortestRoute, type Edge, type Station, type TrackType } from "./network";
import type { Train } from "./sim";

const PRODUCT: Record<string, string> = {
  ICE: "nationalExpress", ECE: "nationalExpress", RJ: "nationalExpress", RJX: "nationalExpress",
  IC: "national", EC: "national", IR: "national", NJ: "national", EN: "national", D: "national",
  RE: "regionalExpress", DRE: "regionalExpress", REX: "regionalExpress", IRE: "regionalExpress",
  S: "suburban", DBS: "suburban",
};

/** HAFAS time "HHMMSS" or "DDHHMMSS" → minutes. */
export const hafasMin = (t?: string): number | null => {
  if (!t) return null;
  const s = t.padStart(8, "0");
  return +s.slice(0, 2) * 1440 + +s.slice(2, 4) * 60 + +s.slice(4, 6);
};

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|hbf|hauptbahnhof|\./g, "").replace(/\s+/g, " ").trim();
const BY_NAME = new Map(STATIONS.map((s) => [norm(s.name), s.id]));
const findStation = (name: string) => BY_NAME.get(norm(name)) ?? [...BY_NAME].find(([k]) => norm(name).startsWith(k + " ") || norm(name) === k)?.[1];

/** Delay (min) at the next stop with realtime data; never negative. */
export function delayOf(stops: any[]): number {
  let last = 0;
  for (const s of stops ?? []) {
    const a = hafasMin(s.aTimeR) != null && hafasMin(s.aTimeS) != null ? hafasMin(s.aTimeR)! - hafasMin(s.aTimeS)! : null;
    const d = hafasMin(s.dTimeR) != null && hafasMin(s.dTimeS) != null ? hafasMin(s.dTimeR)! - hafasMin(s.dTimeS)! : null;
    const v = a ?? d;
    if (v != null) last = v;
  }
  return Math.max(0, Math.round(last));
}

const IN_DE = (lat: number, lon: number) => lat > 47.2 && lat < 55.1 && lon > 5.8 && lon < 15.1;

const TYPE_OF: Record<string, TrackType> = {
  nationalExpress: "hs", national: "main", regionalExpress: "secondary", regional: "secondary", suburban: "secondary",
};
const RANK: Record<TrackType, number> = { hs: 3, main: 2, secondary: 1, industrial: 0 };

/** Fraction along segment p→q closest to point x, and squared distance. */
const project = (p: number[], q: number[], x: number[]) => {
  const dx = q[0]! - p[0]!, dy = q[1]! - p[1]!, l = dx * dx + dy * dy || 1e-12;
  const t = Math.min(1, Math.max(0, ((x[0]! - p[0]!) * dx + (x[1]! - p[1]!) * dy) / l));
  return { t, d: (p[0]! + t * dx - x[0]!) ** 2 + (p[1]! + t * dy - x[1]!) ** 2 };
};

export type ParsedFeed = { trains: Train[]; stations: Station[]; edges: Edge[] };

/** Convert live positions into trains that follow their real stop sequence. */
export function parseGeoPos(res: any): ParsedFeed {
  const prodL: any[] = res?.common?.prodL ?? [];
  const locL: any[] = res?.common?.locL ?? [];
  const out: Train[] = [];
  const stations = new Map<string, Station>();
  const edges = new Map<string, Edge>();
  const stationFor = (loc: any): string | null => {
    if (!loc?.crd || !loc.name) return null;
    const known = findStation(loc.name);
    if (known) return known;
    const id = String(loc.name).trim();
    if (!stations.has(id)) stations.set(id, { id, name: id, lat: loc.crd.y / 1e6, lon: loc.crd.x / 1e6, minor: true });
    return id;
  };
  const coord = (id: string) => { const st = STATION[id] ?? stations.get(id)!; return [st.lat, st.lon]; };
  for (const j of res?.jnyL ?? []) {
    const p = prodL[j.prodX];
    const cat = (p?.prodCtx?.catOutS ?? "").trim().toUpperCase();
    if (!p || /BUS|TRAM|STR|U$|^U\d|SCH|FAE|TAXI/.test(cat) || (p.cls ?? 0) >= 32 && !PRODUCT[cat]) continue;
    const lat = j.pos?.y / 1e6, lon = j.pos?.x / 1e6;
    if (!IN_DE(lat, lon)) continue;
    const product = PRODUCT[cat] ?? "regional";
    const base = { id: j.jid, name: (p.nameS ?? p.name ?? "?").trim(), product, direction: j.dirTxt ?? "", baseDelay: delayOf(j.stopL) };
    // Real trajectory: the train's own stop sequence.
    const seq: string[] = [];
    for (const st of j.stopL ?? []) { const id = stationFor(locL[st.locX]); if (id && id !== seq.at(-1)) seq.push(id); }
    if (seq.length >= 2) {
      const type = TYPE_OF[product] ?? "secondary";
      const routeEdges = seq.slice(1).map((b, i) => {
        const a = seq[i]!, key = [a, b].sort().join("~");
        const id = `r:${key}`;
        const prev = edges.get(id);
        if (!prev || RANK[type] > RANK[prev.type]) edges.set(id, { id, a: [a, b].sort()[0]!, b: [a, b].sort()[1]!, type });
        return id;
      });
      let best = { i: 0, t: 0.05, d: Infinity };
      for (let i = 0; i < seq.length - 1; i++) {
        const r = project(coord(seq[i]!), coord(seq[i + 1]!), [lat, lon]);
        if (r.d < best.d) best = { i, t: r.t, d: r.d };
      }
      out.push({ ...base, direction: j.dirTxt ?? seq.at(-1)!, route: { stations: seq, edges: routeEdges }, edgeIdx: best.i, frac: Math.min(0.97, Math.max(0.03, best.t)) });
      continue;
    }
    // Fallback: snap to the schematic network.
    const e = nearestEdge(lat, lon);
    const A = STATION[e.a]!, B = STATION[e.b]!;
    const dest = findStation(j.dirTxt ?? "");
    const dist = (s: { lat: number; lon: number }, t: { lat: number; lon: number }) => Math.hypot(s.lat - t.lat, s.lon - t.lon);
    const toB = dest ? dist(B, STATION[dest]!) <= dist(A, STATION[dest]!) : true;
    const [from, to] = toB ? [A, B] : [B, A];
    const frac = Math.min(0.95, Math.max(0.05, dist(from, { lat, lon }) / Math.max(1e-6, dist(from, to))));
    const tail = dest && dest !== to.id ? shortestRoute(to.id, dest) : null;
    out.push({ ...base, direction: j.dirTxt ?? to.name, route: { stations: [from.id, to.id, ...(tail?.stations.slice(1) ?? [])], edges: [e.id, ...(tail?.edges ?? [])] }, edgeIdx: 0, frac });
  }
  return { trains: out, stations: [...stations.values()], edges: [...edges.values()] };
}
