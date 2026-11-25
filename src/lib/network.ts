// Simplified schematic of the German rail network (DB corridors).
export type TrackType = "hs" | "main" | "secondary" | "industrial";
export type Station = { id: string; name: string; lat: number; lon: number; minor?: boolean };
export type Edge = { id: string; a: string; b: string; type: TrackType; offset?: number | undefined };

export const SPEED: Record<TrackType, number> = { hs: 250, main: 140, secondary: 90, industrial: 60 };
export const TRACK_LABEL: Record<TrackType, string> = {
  hs: "High-speed", main: "Main line", secondary: "Secondary", industrial: "Branch / industrial",
};

const S: [string, number, number][] = [
  ["Hamburg", 53.553, 10.007], ["Bremen", 53.083, 8.813], ["Hannover", 52.377, 9.741], ["Berlin", 52.525, 13.369],
  ["Leipzig", 51.345, 12.382], ["Dresden", 51.040, 13.732], ["Erfurt", 50.973, 11.038], ["Kassel", 51.313, 9.447],
  ["Göttingen", 51.536, 9.927], ["Dortmund", 51.518, 7.459], ["Essen", 51.451, 7.014], ["Duisburg", 51.430, 6.776],
  ["Düsseldorf", 51.220, 6.794], ["Köln", 50.943, 6.959], ["Bonn", 50.732, 7.097], ["Koblenz", 50.351, 7.589],
  ["Mainz", 50.001, 8.259], ["Frankfurt", 50.107, 8.663], ["Mannheim", 49.479, 8.470], ["Karlsruhe", 48.994, 8.400],
  ["Stuttgart", 48.784, 9.182], ["Ulm", 48.399, 9.983], ["Augsburg", 48.365, 10.886], ["München", 48.140, 11.558],
  ["Nürnberg", 49.446, 11.082], ["Würzburg", 49.802, 9.936], ["Fulda", 50.555, 9.684], ["Bielefeld", 52.029, 8.533],
  ["Münster", 51.957, 7.635], ["Osnabrück", 52.273, 8.061], ["Wolfsburg", 52.429, 10.788], ["Magdeburg", 52.130, 11.627],
  ["Halle", 51.477, 11.987], ["Rostock", 54.078, 12.131], ["Kiel", 54.315, 10.132], ["Lübeck", 53.868, 10.670],
  ["Schwerin", 53.634, 11.408], ["Freiburg", 47.998, 7.841], ["Regensburg", 49.012, 12.100], ["Saarbrücken", 49.241, 6.991],
  ["Chemnitz", 50.840, 12.930], ["Cottbus", 51.750, 14.326], ["Hof", 50.308, 11.923], ["Ingolstadt", 48.744, 11.437],
  ["Siegen", 50.875, 8.018], ["Aachen", 50.768, 6.091], ["Emden", 53.369, 7.205], ["Passau", 48.574, 13.450],
  ["Paderborn", 51.713, 8.743], ["Braunschweig", 52.252, 10.540], ["Uelzen", 52.966, 10.556], ["Bebra", 50.971, 9.790],
];
export const STATIONS: Station[] = S.map(([name, lat, lon]) => ({ id: name, name, lat, lon }));
export const STATION = Object.fromEntries(STATIONS.map((s) => [s.id, s])) as Record<string, Station>;

const E: [string, string, TrackType, number?][] = [
  // Alta velocidade
  ["Hannover", "Göttingen", "hs"], ["Göttingen", "Kassel", "hs"], ["Kassel", "Fulda", "hs"], ["Fulda", "Würzburg", "hs"],
  ["Köln", "Frankfurt", "hs"], ["Mannheim", "Stuttgart", "hs"], ["Stuttgart", "Ulm", "hs"], ["Hannover", "Wolfsburg", "hs"],
  ["Wolfsburg", "Berlin", "hs"], ["Nürnberg", "Ingolstadt", "hs"], ["Ingolstadt", "München", "hs"], ["Nürnberg", "Erfurt", "hs"],
  ["Erfurt", "Halle", "hs"], ["Halle", "Leipzig", "hs"], ["Leipzig", "Berlin", "hs"], ["Hamburg", "Berlin", "hs"],
  ["Frankfurt", "Mannheim", "hs"],
  // Principal
  ["Hamburg", "Bremen", "main"], ["Bremen", "Osnabrück", "main"], ["Osnabrück", "Münster", "main"], ["Münster", "Dortmund", "main"],
  ["Hamburg", "Uelzen", "main"], ["Uelzen", "Hannover", "main"], ["Hannover", "Bielefeld", "main"], ["Bielefeld", "Dortmund", "main"],
  ["Dortmund", "Essen", "main"], ["Essen", "Duisburg", "main"], ["Duisburg", "Düsseldorf", "main"], ["Düsseldorf", "Köln", "main"],
  ["Köln", "Bonn", "main"], ["Bonn", "Koblenz", "main"], ["Koblenz", "Mainz", "main"], ["Mainz", "Frankfurt", "main"],
  ["Mainz", "Mannheim", "main"], ["Frankfurt", "Fulda", "main"], ["Frankfurt", "Würzburg", "main"], ["Würzburg", "Nürnberg", "main"],
  ["Mannheim", "Karlsruhe", "main"], ["Karlsruhe", "Stuttgart", "main"], ["Karlsruhe", "Freiburg", "main"], ["Ulm", "Augsburg", "main"],
  ["Augsburg", "München", "main"], ["Nürnberg", "Regensburg", "main"], ["Regensburg", "Passau", "main"], ["Leipzig", "Dresden", "main"],
  ["Dresden", "Berlin", "main"], ["Hamburg", "Lübeck", "main"], ["Hamburg", "Kiel", "main"], ["Berlin", "Magdeburg", "main"],
  ["Magdeburg", "Halle", "main"], ["Köln", "Aachen", "main"], ["Erfurt", "Bebra", "main"], ["Bebra", "Fulda", "main"],
  ["Bebra", "Kassel", "main"], ["Berlin", "Rostock", "main"], ["Hamburg", "Schwerin", "main"], ["Mannheim", "Saarbrücken", "main"],
  ["Hannover", "Braunschweig", "main"], ["Braunschweig", "Magdeburg", "main"],
  // Secundária
  ["Lübeck", "Rostock", "secondary"], ["Schwerin", "Rostock", "secondary"], ["Leipzig", "Chemnitz", "secondary"],
  ["Chemnitz", "Dresden", "secondary"], ["Hof", "Nürnberg", "secondary"], ["Hof", "Chemnitz", "secondary"],
  ["Berlin", "Cottbus", "secondary"], ["Cottbus", "Dresden", "secondary"], ["Siegen", "Köln", "secondary"],
  ["Siegen", "Frankfurt", "secondary"], ["Saarbrücken", "Koblenz", "secondary"], ["Kassel", "Paderborn", "secondary"],
  ["Paderborn", "Dortmund", "secondary"], ["Paderborn", "Bielefeld", "secondary"], ["Emden", "Bremen", "secondary"],
  ["Emden", "Münster", "secondary"], ["München", "Regensburg", "secondary"], ["Ingolstadt", "Regensburg", "secondary"],
  ["Göttingen", "Halle", "secondary"], ["Wolfsburg", "Magdeburg", "secondary"], ["Bielefeld", "Osnabrück", "secondary"],
  ["Augsburg", "Ingolstadt", "secondary"], ["Erfurt", "Leipzig", "secondary"], ["Uelzen", "Braunschweig", "secondary"],
  // Ramais / industriais (rotas de carga paralelas)
  ["Köln", "Koblenz", "industrial", 0.12], ["Koblenz", "Frankfurt", "industrial", 0.1], ["Duisburg", "Dortmund", "industrial", 0.08],
  ["Mannheim", "Karlsruhe", "industrial", 0.07], ["Hamburg", "Hannover", "industrial", 0.15], ["Köln", "Duisburg", "industrial", 0.1],
  ["Würzburg", "Ulm", "industrial"], ["Halle", "Hof", "industrial"], ["Bremen", "Hannover", "industrial"],
];
export const EDGES: Edge[] = E.map(([a, b, type, offset], i) => ({ id: `e${i}`, a, b, type, offset }));
export const EDGE = Object.fromEntries(EDGES.map((e) => [e.id, e])) as Record<string, Edge>;

/** Add real stations/segments captured from the live feed (idempotent). */
export function registerNetwork(stations: Station[], edges: Edge[]) {
  for (const st of stations) if (!STATION[st.id]) { STATIONS.push(st); STATION[st.id] = st; }
  for (const e of edges) if (!EDGE[e.id] && STATION[e.a] && STATION[e.b]) { EDGES.push(e); EDGE[e.id] = e; }
}

export function edgePoints(e: Edge): [number, number][] {
  const A = STATION[e.a]!, B = STATION[e.b]!;
  if (!e.offset) return [[A.lat, A.lon], [B.lat, B.lon]];
  const dx = B.lon - A.lon, dy = B.lat - A.lat, len = Math.hypot(dx, dy) || 1;
  const mid: [number, number] = [(A.lat + B.lat) / 2 + (dx / len) * e.offset, (A.lon + B.lon) / 2 - (dy / len) * e.offset];
  return [[A.lat, A.lon], mid, [B.lat, B.lon]];
}

const km = (p: [number, number], q: [number, number]) =>
  Math.hypot((p[0] - q[0]) * 111, (p[1] - q[1]) * 111 * Math.cos((p[0] * Math.PI) / 180));

export function edgeKm(e: Edge) {
  const p = edgePoints(e);
  let d = 0;
  for (let i = 1; i < p.length; i++) d += km(p[i - 1]!, p[i]!);
  return d * 1.2; // track curvature factor
}
export const edgeMinutes = (e: Edge) => (edgeKm(e) / SPEED[e.type]) * 60;

export const other = (e: Edge, s: string) => (e.a === s ? e.b : e.a);

/** Point at fraction f along edge travelled from station `from`. */
export function pointOnEdge(e: Edge, from: string, f: number): [number, number] {
  let p = edgePoints(e);
  if (from !== e.a) p = [...p].reverse();
  const segs = p.slice(1).map((q, i) => km(p[i]!, q));
  let target = segs.reduce((s, x) => s + x, 0) * f;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]! || i === segs.length - 1) {
      const t = segs[i] ? Math.min(1, target / segs[i]!) : 0;
      return [p[i]![0] + (p[i + 1]![0] - p[i]![0]) * t, p[i]![1] + (p[i + 1]![1] - p[i]![1]) * t];
    }
    target -= segs[i]!;
  }
  return p[0]!;
}

export type Route = { stations: string[]; edges: string[] };

/** Fastest route by travel time, optionally excluding edges. */
export function shortestRoute(from: string, to: string, exclude: Set<string> = new Set()): Route | null {
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, { s: string; e: string }> = {};
  const done = new Set<string>();
  while (true) {
    let u: string | null = null;
    for (const k in dist) if (!done.has(k) && (u === null || dist[k]! < dist[u]!)) u = k;
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const e of EDGES) {
      if (exclude.has(e.id) || (e.a !== u && e.b !== u)) continue;
      const v = other(e, u);
      const nd = dist[u]! + edgeMinutes(e);
      if (dist[v] === undefined || nd < dist[v]!) { dist[v] = nd; prev[v] = { s: u, e: e.id }; }
    }
  }
  const stations = [to], edges: string[] = [];
  let c = to;
  while (c !== from) { const p = prev[c]!; edges.unshift(p.e); stations.unshift(p.s); c = p.s; }
  return { stations, edges };
}

export const routeMinutes = (edges: string[]) => edges.reduce((s, id) => s + edgeMinutes(EDGE[id]!), 0);

/** Alternative routes from `from` to `to` that differ from `current` (destination unchanged). */
export function alternatives(from: string, to: string, current: string[], max = 3): Route[] {
  const seen = new Set([current.join(",")]);
  const out: Route[] = [];
  for (const e of current) {
    const r = shortestRoute(from, to, new Set([e]));
    if (!r) continue;
    const key = r.edges.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.sort((a, b) => routeMinutes(a.edges) - routeMinutes(b.edges)).slice(0, max);
}

export function nearestEdge(lat: number, lon: number): Edge {
  let best = EDGES[0]!, bd = Infinity;
  for (const e of EDGES) {
    const [p, q] = [edgePoints(e)[0]!, edgePoints(e).at(-1)!];
    const mid: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const d = Math.min(km([lat, lon], p), km([lat, lon], q), km([lat, lon], mid));
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
