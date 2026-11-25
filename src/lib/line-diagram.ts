import type { Train } from "./sim";

export type DiagramRoute = { id: string; stations: string[]; edges: string[]; services: Train[] };

/** Group identical itineraries in either direction; never snap live trains to preset corridors. */
export function diagramRoutes(trains: Train[]): DiagramRoute[] {
  const groups = new Map<string, DiagramRoute>();
  for (const train of trains) {
    if (!train.route.edges.length || train.route.stations.length < 2) continue;
    const normal = JSON.stringify([train.route.stations, train.route.edges]);
    const reverse = JSON.stringify([[...train.route.stations].reverse(), [...train.route.edges].reverse()]);
    const id = normal < reverse ? normal : reverse;
    const existing = groups.get(id);
    if (existing) existing.services.push(train);
    else groups.set(id, { id, stations: [...train.route.stations], edges: [...train.route.edges], services: [train] });
  }
  return [...groups.values()].sort((a, b) => b.services.length - a.services.length || a.id.localeCompare(b.id));
}

export type DiagramPosition = { train: Train; x: number; forward: boolean; lane: number };

/** Place by the actual segment and direction, with disjoint label intervals on each lane. */
export function diagramPositions(route: Pick<DiagramRoute, "stations" | "edges">, trains: Train[], gap = 180, pad = 90): DiagramPosition[] {
  const positions: DiagramPosition[] = [];
  for (const train of trains) {
    const edge = train.route.edges[train.edgeIdx];
    const from = train.route.stations[train.edgeIdx];
    const to = train.route.stations[train.edgeIdx + 1];
    const index = route.edges.findIndex((e, i) => e === edge && ((route.stations[i] === from && route.stations[i + 1] === to) || (route.stations[i] === to && route.stations[i + 1] === from)));
    if (index < 0) continue;
    const forward = from === route.stations[index];
    const fraction = Math.max(0, Math.min(1, train.frac));
    positions.push({ train, x: pad + (index + (forward ? fraction : 1 - fraction)) * gap, forward, lane: 0 });
  }
  const ends: Record<"forward" | "reverse", number[]> = { forward: [], reverse: [] };
  positions.sort((a, b) => a.x - b.x || a.train.id.localeCompare(b.train.id));
  for (const position of positions) {
    const lanes = ends[position.forward ? "forward" : "reverse"];
    const left = position.x - 72;
    let lane = lanes.findIndex(end => end + 12 <= left);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = position.x + 72;
    position.lane = lane;
  }
  return positions;
}

/** Stable dedicated rows: train movement cannot reorder or collide with another service. */
export function diagramRows(route: Pick<DiagramRoute, "stations" | "edges">, trains: Train[], gap = 180, pad = 240) {
  return diagramPositions(route, trains, gap, pad)
    .sort((a, b) => Number(b.forward) - Number(a.forward) || a.train.name.localeCompare(b.train.name, undefined, { numeric: true }) || a.train.id.localeCompare(b.train.id))
    .map((position, row) => ({ ...position, row }));
}
/** Sticky rows: trains keep their row while present (direction flips included); freed rows are reused by newcomers. */
export function assignStickyRows(positions: DiagramPosition[], prev: Map<string, number>): Map<string, number> {
  const next = new Map<string, number>(); const used = new Set<number>();
  for (const p of positions) { const r = prev.get(p.train.id); if (r !== undefined && !used.has(r)) { next.set(p.train.id, r); used.add(r); } }
  const fresh = positions.filter(p => !next.has(p.train.id))
    .sort((a, b) => Number(b.forward) - Number(a.forward) || a.train.name.localeCompare(b.train.name, undefined, { numeric: true }) || a.train.id.localeCompare(b.train.id));
  let row = 0;
  for (const p of fresh) { while (used.has(row)) row++; next.set(p.train.id, row); used.add(row); }
  return next;
}

export type CorridorLayout = { id: string; stations: string[]; edges: string[]; weight: number };

/** Session-stable corridor layout: keeps every previous corridor untouched and only chains segments not yet assigned. */
export function extendCorridors(prev: CorridorLayout[] | undefined, trains: Train[], maxEdges = 40): CorridorLayout[] {
  const ends = new Map<string, [string, string]>(); const usage = new Map<string, number>(); const links = new Map<string, Map<string, number>>();
  const link = (edge: string, station: string, next: string) => { const key = `${edge}|${station}`; const m = links.get(key) ?? new Map(); m.set(next, (m.get(next) ?? 0) + 1); links.set(key, m); };
  for (const t of trains) {
    const { stations: st, edges } = t.route;
    if (!edges.length || st.length < 2) continue;
    edges.forEach((e, i) => {
      if (!ends.has(e)) ends.set(e, [st[i]!, st[i + 1]!]);
      usage.set(e, (usage.get(e) ?? 0) + 1);
      if (i + 1 < edges.length) { link(e, st[i + 1]!, edges[i + 1]!); link(edges[i + 1]!, st[i + 1]!, e); }
    });
  }
  const layout = [...(prev ?? [])]; const assigned = new Set(layout.flatMap(c => c.edges)); const added: CorridorLayout[] = [];
  for (const [seed] of [...usage].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (assigned.has(seed)) continue;
    assigned.add(seed);
    const [a, b] = ends.get(seed)!; const stations = [a, b]; const edges = [seed];
    const extend = (atEnd: boolean) => {
      while (edges.length < maxEdges) {
        const edge = atEnd ? edges.at(-1)! : edges[0]; const station = atEnd ? stations.at(-1)! : stations[0];
        const next = [...(links.get(`${edge}|${station}`) ?? [])].filter(([e]) => !assigned.has(e)).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
        if (!next) break;
        const [x, y] = ends.get(next[0])!; const other = x === station ? y : x;
        if (stations.includes(other)) break;
        assigned.add(next[0]);
        if (atEnd) { edges.push(next[0]); stations.push(other); } else { edges.unshift(next[0]); stations.unshift(other); }
      }
    };
    extend(true); extend(false);
    // Weight = trains whose itinerary touches this corridor at capture time; fixed afterwards so order never shifts.
    const set = new Set(edges);
    const weight = trains.filter(t => t.route.edges.some(e => set.has(e))).length;
    added.push({ id: edges.join(">"), stations, edges, weight });
  }
  added.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  return [...layout, ...added];
}

/** Attach each train once, to the corridor holding its current segment; corridor order follows the layout. */
export function assignServices(layout: CorridorLayout[], trains: Train[]): (DiagramRoute & { weight: number })[] {
  const corridors = layout.map(c => ({ ...c, services: [] as Train[] }));
  const byEdge = new Map<string, (typeof corridors)[number]>();
  corridors.forEach(c => c.edges.forEach(e => byEdge.set(e, c)));
  for (const t of trains) { const e = t.route.edges[t.edgeIdx]; if (e) byEdge.get(e)?.services.push(t); }
  return corridors;
}

/** Operator-style corridors: chain the most-travelled shared segments; each train appears once, on the corridor holding its current segment. */
export function diagramCorridors(trains: Train[], maxEdges = 40): DiagramRoute[] {
  return assignServices(extendCorridors(undefined, trains, maxEdges), trains).filter(c => c.services.length);
}
