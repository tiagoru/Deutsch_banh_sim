import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Search, TrainFront, TriangleAlert, ZoomIn, ZoomOut, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { statusOf, type Train } from "@/lib/sim";
import { EDGE, STATION, TRACK_LABEL, type TrackType } from "@/lib/network";
import { assignServices, assignStickyRows, diagramPositions, extendCorridors, type CorridorLayout, type DiagramRoute } from "@/lib/line-diagram";
import type { Incident } from "@/lib/timeline";

type Props = {
  trains: Train[]; delays: Map<string, number>; removed: Set<string>;
  selectedId: string | null; onSelect: (id: string) => void;
  incidents?: Incident[]; heldIds?: Set<string>; reentries?: Record<string, number>;
};
const TRACK: Record<TrackType, string> = { hs: "var(--track-hs)", main: "var(--track-main)", secondary: "var(--track-sec)", industrial: "var(--track-ind)" };
const STATUS = { green: "text-ok border-ok/60", yellow: "text-warn border-warn/60", red: "text-late border-late/60" };
const stationName = (id: string) => STATION[id]?.name ?? id;
const routeName = (route: DiagramRoute) => `${stationName(route.stations[0] ?? "")} → ${stationName(route.stations.at(-1) ?? "")}`;

function RouteTracks({ route, ...props }: Props & { route: DiagramRoute; zoom: number }) {
  const gap = props.zoom; const pad = 240;
  const rowsRef = useRef(new Map<string, number>());
  const lastX = useRef(new Map<string, number>());
  const positions = useMemo(() => {
    const placed = diagramPositions(route, props.trains, gap, pad);
    const rows = assignStickyRows(placed, rowsRef.current); rowsRef.current = rows;
    return placed.map(p => ({ ...p, row: rows.get(p.train.id)! }));
  }, [route, props.trains, gap]);
  const jumps = new Set(positions.filter(p => Math.abs((lastX.current.get(p.train.id) ?? p.x) - p.x) > gap * .75).map(p => p.train.id));
  useEffect(() => { lastX.current = new Map(positions.map(p => [p.train.id, p.x])); }, [positions]);
  const rowHeight = 64; const headerHeight = 100;
  const width = pad + gap * (route.stations.length - 1) + 100;
  const rowCount = positions.reduce((m, p) => Math.max(m, p.row + 1), 1);
  const height = headerHeight + rowCount * rowHeight + 16;
  return <div className="max-h-[65vh] overflow-auto border-t border-border bg-background" aria-label={`Diagram ${routeName(route)}`}>
    <svg width={width} height={height} className="block" role="group" aria-label="Stations and trains by direction">
      <text x={20} y={30} fill="var(--muted-foreground)" fontSize={11}>TRAIN / DELAY</text>
      {route.edges.map((id, i) => {
        const edge = EDGE[id]; const incident = props.incidents?.find(item => item.edge === id);
        const color = edge ? TRACK[edge.type] : "var(--muted-foreground)";
        return <g key={`${id}-${i}`}>
          <title>{`${stationName(route.stations[i] ?? "")} – ${stationName(route.stations[i + 1] ?? "")} · ${edge ? TRACK_LABEL[edge.type] : "Track type unavailable"}`}</title>
          <line x1={pad + i * gap} x2={pad + (i + 1) * gap} y1={20} y2={20} stroke={color} strokeWidth={4} strokeDasharray={edge?.type === "industrial" ? "8 5" : undefined} />
          {incident && <text x={pad + (i + .5) * gap} y={88} textAnchor="middle" fill={incident.kind === "broken" ? "var(--late)" : "var(--warn)"} fontSize={11}>{incident.kind === "broken" ? "⚠ Breakdown" : "⚠ Slowdown"}</text>}
        </g>;
      })}
      {route.stations.map((station, i) => <g key={`${station}-${i}`}>
        <circle cx={pad + i * gap} cy={20} r={5} fill="var(--background)" stroke="var(--foreground)" strokeWidth={2} />
        <foreignObject x={pad + i * gap - 75} y={34} width={150} height={44}><div className="line-station-name text-center text-xs font-medium" title={stationName(station)}>{stationName(station)}</div></foreignObject>
        <line x1={pad + i * gap} x2={pad + i * gap} y1={headerHeight} y2={height - 16} stroke="var(--border)" strokeDasharray="3 5" />
      </g>)}
      {positions.map(({ train, x, forward, row }) => {
        const trainY = headerHeight + row * rowHeight + rowHeight / 2;
        const delay = props.delays.get(train.id) ?? train.baseDelay;
        const waiting = props.reentries?.[train.id] !== undefined;
        const removed = props.removed.has(train.id);
        const broken = props.incidents?.some(i => i.trainId === train.id && i.kind === "broken");
        const held = props.heldIds?.has(train.id);
        const selected = props.selectedId === train.id;
        const stateLabel = waiting ? "Waiting for departure slot" : removed ? "Removed" : broken ? "Broken down" : held ? "Held" : `${Math.round(delay)} min delay`;
        const color = removed ? "var(--muted-foreground)" : statusOf(delay) === "green" ? "var(--ok)" : statusOf(delay) === "yellow" ? "var(--warn)" : "var(--late)";
        return <g key={train.id} data-train-row={train.id}>
          <rect x={0} y={trainY - rowHeight / 2} width={width} height={rowHeight} fill={selected ? "var(--accent)" : row % 2 ? "var(--card)" : "var(--background)"} />
          <line x1={0} x2={width} y1={trainY + rowHeight / 2} y2={trainY + rowHeight / 2} stroke="var(--border)" />
          {route.edges.map((id, i) => {
            const color = EDGE[id] ? TRACK[EDGE[id].type] : "var(--muted-foreground)";
            return <line key={`${id}-${i}`} x1={pad + i * gap} x2={pad + (i + 1) * gap} y1={trainY} y2={trainY} stroke={color} strokeWidth={2} opacity={.35} strokeDasharray={EDGE[id]?.type === "industrial" ? "6 4" : undefined} />;
          })}
          {route.stations.map((station, i) => <line key={`${station}-${i}`} x1={pad + i * gap} x2={pad + i * gap} y1={trainY - 7} y2={trainY + 7} stroke="var(--muted-foreground)" opacity={.6} />)}
          <foreignObject x={12} y={trainY - 24} width={200} height={48}>
            <Button variant="ghost" onClick={() => props.onSelect(train.id)} aria-label={`${train.name} · ${stateLabel}`} aria-pressed={selected} title={`${train.name} → ${train.direction} · ${stateLabel}`} className={`h-12 w-full justify-start gap-2 rounded px-2 ${removed ? "text-muted-foreground" : STATUS[statusOf(delay)]} ${selected ? "ring-1 ring-primary" : ""}`}>
              {broken || held ? <TriangleAlert /> : <TrainFront />}
              <span className="min-w-0 flex-1 text-left"><span className="block truncate font-mono text-xs font-semibold">{train.name}</span><span className="block truncate text-[10px] text-muted-foreground">{waiting || removed || held || broken ? stateLabel : `→ ${train.direction}`}</span></span>
              <span className="shrink-0 font-mono text-xs">{waiting ? "⏱" : removed ? "—" : `${Math.round(delay)}′`}</span>
            </Button>
          </foreignObject>
          <g style={{ transform: `translate(${x - 24}px, ${trainY - 20}px)`, transition: jumps.has(train.id) ? "none" : "transform 500ms linear" }}>
            <foreignObject x={0} y={0} width={48} height={40}>
              <Button variant="outline" onClick={() => props.onSelect(train.id)} aria-label={`Position of ${train.name}`} title={`${train.name} · ${stateLabel}`} className={`h-10 w-12 gap-0.5 rounded px-1 ${removed ? "border-border text-muted-foreground" : STATUS[statusOf(delay)]} ${selected ? "bg-primary/15 ring-2 ring-primary" : "bg-card"}`}>
                <TrainFront className="!size-5" />{forward ? <ArrowRight className="!size-3" /> : <ArrowLeft className="!size-3" />}
              </Button>
            </foreignObject>
          </g>
        </g>;
      })}
    </svg>
  </div>;
}

// Only render corridors near the viewport; off-screen ones keep a placeholder of similar height.
function LazyVisible({ children, estimate }: { children: React.ReactNode; estimate: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: "400px 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} style={visible ? undefined : { height: Math.min(estimate, window.innerHeight * .65) }}>{visible ? children : null}</div>;
}

export default function LineDiagram(props: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(180);
  const selected = props.trains.find(t => t.id === (props.selectedId ?? focusedId));
  const filtered = useMemo(() => props.trains.filter(train => {
    const removed = props.removed.has(train.id);
    const delay = props.delays.get(train.id) ?? train.baseDelay;
    if (status === "active" && removed || status === "late" && (removed || delay <= .5) || status === "removed" && !removed) return false;
    if (product === "long" && !["nationalExpress", "national"].includes(train.product)) return false;
    if (product === "regional" && !train.product.startsWith("regional")) return false;
    if (product === "suburban" && train.product !== "suburban") return false;
    const haystack = [train.name, train.direction, ...train.route.stations.map(stationName)].join(" ").toLocaleLowerCase();
    return haystack.includes(search.trim().toLocaleLowerCase());
  }), [props.trains, props.removed, props.delays, status, product, search]);
  // Layout depends only on the set of segments in the session (never on filters or train positions).
  const edgeKey = useMemo(() => [...new Set(props.trains.flatMap(t => t.route.edges))].sort().join("|"), [props.trains]);
  const layoutRef = useRef<CorridorLayout[] | undefined>(undefined);
  const layout = useMemo(() => (layoutRef.current = extendCorridors(layoutRef.current, props.trains)), [edgeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtering = search.trim() !== "" || product !== "all" || status !== "all";
  const routes = useMemo(() => {
    const all = assignServices(layout, filtered).filter(c => !filtering || c.services.length);
    return [...all.filter(c => c.weight >= 3), ...all.filter(c => c.weight < 3)];
  }, [layout, filtered, filtering]);
  const unplaced = useMemo(() => filtered.filter(t => !t.route.edges.length || t.route.stations.length < 2), [filtered]);
  const hiddenStates = props.trains.length - filtered.length;
  const focusedRoute = selected ? { id: `selected-${selected.id}`, stations: selected.route.stations, edges: selected.route.edges, services: [selected] } : null;
  const visible = focus && focusedRoute ? [focusedRoute] : routes;
  const focusCount = focusedRoute ? diagramPositions(focusedRoute, filtered).length : 0;
  const resetFilters = () => { setSearch(""); setProduct("all"); setStatus("all"); };
  return <div className="flex h-full min-h-0 flex-col bg-background pt-14" aria-label="Network line diagram">
    <header className="shrink-0 space-y-3 border-b border-border px-4 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-semibold">Operating lines</h2><p className="font-mono text-[11px] text-muted-foreground">{focus && selected ? `${focusCount} trains on selected route` : `${filtered.length} of ${props.trains.length} trains · ${routes.length} corridors`}{!focus && hiddenStates > 0 && status !== "all" ? ` · ${hiddenStates} hidden by status filter` : ""}</p></div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(routes.map(r => r.id)))}>{collapsed.size ? "Expand all" : "Collapse all"}</Button>
          <Button size="sm" variant={focus && selected ? "default" : "outline"} disabled={!selected} aria-pressed={focus && !!selected} onClick={() => setFocus(!focus)}><LocateFixed />Selected route</Button>
          <Button variant="ghost" size="icon" title="Reduce spacing" aria-label="Reduce spacing" disabled={zoom <= 180} onClick={() => setZoom(z => z - 60)}><ZoomOut /></Button>
          <Button variant="ghost" size="icon" title="Increase spacing" aria-label="Increase spacing" disabled={zoom >= 360} onClick={() => setZoom(z => z + 60)}><ZoomIn /></Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-40 flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search train or station" placeholder="Train or station" className="pl-9 text-xs" value={search} onChange={e => { setSearch(e.target.value) }} /></div>
        <select aria-label="Train category" value={product} onChange={e => { setProduct(e.target.value) }} className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-xs"><option value="all">All categories</option><option value="long">ICE · IC · EC</option><option value="regional">Regional</option><option value="suburban">S-Bahn</option></select>
        <select aria-label="Train status" value={status} onChange={e => { setStatus(e.target.value) }} className="h-9 rounded-md border border-input bg-background px-2 text-xs"><option value="active">In service</option><option value="late">Delayed</option><option value="removed">Removed / waiting</option><option value="all">All statuses</option></select>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        {Object.entries(TRACK_LABEL).map(([type, label]) => <span key={type} className="flex items-center gap-1.5"><span className={`h-1 w-5 ${type === "hs" ? "bg-track-hs" : type === "main" ? "bg-track-main" : type === "secondary" ? "bg-track-sec" : "bg-track-ind"}`} />{label}</span>)}
        <span className="text-ok">On time</span><span className="text-warn">≤10 min</span><span className="text-late">&gt;10 min</span>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {visible.map((route, i) => {
        const open = focus && !!selected || !collapsed.has(route.id);
        const services = focus && selected ? diagramPositions(route, filtered).map(position => position.train) : route.services;
        const delayed = services.filter(t => !props.removed.has(t.id) && (props.delays.get(t.id) ?? t.baseDelay) > .5).length;
        const weightOf = (r: DiagramRoute) => "weight" in r ? (r as { weight: number }).weight : 99;
        const firstSmall = !(focus && selected) && weightOf(route) < 3 && (i === 0 || weightOf(visible[i - 1]!) >= 3);
        return <section key={route.id} className="border-b border-border">{firstSmall && <p className="bg-muted px-4 py-2 text-xs font-semibold">Other sections (low traffic)</p>}
          <Button variant="ghost" onClick={() => setCollapsed(c => { const n = new Set(c); if (n.has(route.id)) n.delete(route.id); else n.add(route.id); return n; })} aria-expanded={open} className="h-auto min-h-16 w-full justify-between gap-3 rounded-none px-4 py-3 text-left">
            <span className="min-w-0 flex-1"><span className="block whitespace-normal break-words text-sm font-semibold">{routeName(route)}</span><span className="mt-1 block whitespace-normal font-mono text-[10px] text-muted-foreground">{route.stations.length} stations · {services.length} trains{delayed ? ` · ${delayed} delayed` : ""}</span></span>
            <ChevronDown className={open ? "rotate-180" : ""} />
          </Button>
          {open && <LazyVisible estimate={100 + Math.max(1, services.length) * 64}><RouteTracks {...props} onSelect={id => { setFocusedId(id); props.onSelect(id); }} trains={services} route={route} zoom={zoom} /></LazyVisible>}
        </section>;
      })}
      {!(focus && selected) && unplaced.length > 0 && <section className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">No route supplied by feed</p>
        <p className="mb-2 font-mono text-[10px] text-muted-foreground">{unplaced.length} trains · approximate position on map only</p>
        <div className="flex flex-wrap gap-1">{unplaced.map(t => { const d = props.delays.get(t.id) ?? t.baseDelay; return <Button key={t.id} size="sm" variant="outline" onClick={() => props.onSelect(t.id)} className={`h-8 px-2 font-mono text-xs ${STATUS[statusOf(d)]}`}>{t.name} · {Math.round(d)}′</Button>; })}</div>
      </section>}
      {!visible.length && !unplaced.length && <div className="flex flex-col items-center gap-3 px-4 py-12 text-center"><TrainFront className="size-8 text-muted-foreground" /><p className="text-sm">No routes found</p><Button size="sm" variant="outline" onClick={resetFilters}>Clear filters</Button></div>}
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-2 text-[10px] text-muted-foreground">
      <span>Session routes · schematic directions · simulated positions · estimated track types</span>
      <span className="font-mono">Map: {props.trains.length} trains · Diagram: {routes.reduce((n, r) => n + r.services.length, 0) + unplaced.length}{filtered.length < props.trains.length ? ` · ${props.trains.length - filtered.length} hidden by filters` : ""}</span>
    </footer>
  </div>;
}
