import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { statusOf, position, type Train } from "@/lib/sim";
import { EDGES, EDGE, STATION, STATIONS, edgePoints, TRACK_LABEL, type Route, type TrackType } from "@/lib/network";
import type { DepotReturn } from "@/lib/timeline";

type Props = {
  trains: Train[];
  delays: Map<string, number>;
  removed: Set<string>;
  selected: Train | null;
  preview: Route | null;
  onSelect: (id: string) => void;
  returns: Record<string, DepotReturn>;
};

const WEIGHT: Record<TrackType, number> = { hs: 6, main: 4.5, secondary: 3.5, industrial: 3 };

const trainSvg = (color: string, big: boolean, faded: boolean, sel: boolean) => {
  const w = big ? 22 : 17;
  return `<svg width="${w}" height="${w}" viewBox="0 0 24 24" style="opacity:${faded ? 0.35 : 1};filter:drop-shadow(0 1px 2px rgba(0,0,0,.9))">
    ${sel ? '<circle cx="12" cy="12" r="11.5" fill="none" stroke="#fff" stroke-width="1.5"/>' : ""}
    <rect x="5" y="2" width="14" height="16" rx="4" fill="${color}" stroke="#111" stroke-width="1.2"/>
    <rect x="7.5" y="5" width="9" height="5" rx="1" fill="#111" opacity=".75"/>
    <circle cx="9" cy="14" r="1.3" fill="#111"/><circle cx="15" cy="14" r="1.3" fill="#111"/>
    <path d="M8 18 L5.5 22 M16 18 L18.5 22" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
    ${faded ? '<path d="M3 3 L21 21" stroke="#fff" stroke-width="2"/>' : ""}
  </svg>`;
};

const routeLatLngs = (r: Route, fromIdx = 0) =>
  r.edges.slice(fromIdx).map((id, i) => {
    const e = EDGE[id];
    if (!e) return [];
    const p = edgePoints(e);
    return r.stations[fromIdx + i] === e.a ? p : [...p].reverse();
  });

export default function RailMap({ trains, delays, removed, selected, preview, onSelect, returns }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const trainLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const bounds = L.latLngBounds([46.9, 5.2], [55.4, 15.6]);
    const m = L.map(el.current, { fadeAnimation: false, zoomAnimation: false, maxBounds: bounds, minZoom: 6, maxBoundsViscosity: 1, zoomSnap: 0.5 }).setView([51.2, 10.4], 6.5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 12, className: "dark-tiles" }).addTo(m);
    const css = getComputedStyle(document.documentElement);
    const color: Record<TrackType, string> = {
      hs: css.getPropertyValue("--track-hs"), main: css.getPropertyValue("--track-main"),
      secondary: css.getPropertyValue("--track-sec"), industrial: css.getPropertyValue("--track-ind"),
    };
    const order: TrackType[] = ["industrial", "secondary", "main", "hs"];
    for (const type of order)
      for (const e of EDGES.filter((x) => x.type === type))
        L.polyline(edgePoints(e), { color: color[type], weight: WEIGHT[type], opacity: 0.95, dashArray: type === "industrial" ? "6 4" : undefined, interactive: true })
          .bindTooltip(`${e.a} – ${e.b}<br/>${TRACK_LABEL[type]}`, { sticky: true })
          .addTo(m);
    for (const s of STATIONS)
      L.circleMarker([s.lat, s.lon], { radius: s.minor ? 2 : 3.5, color: "#fff", weight: s.minor ? 1 : 1.5, fillColor: "#111", fillOpacity: 1 })
        .bindTooltip(s.name, { permanent: !s.minor, direction: "right", className: "station-label", offset: [4, 0] })
        .addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    trainLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    const tm = setTimeout(() => m.invalidateSize({ pan: false }), 100);
    return () => { clearTimeout(tm); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = routeLayer.current;
    if (!g) return;
    g.clearLayers();
    const returning = selected ? returns[selected.id] : undefined;
    const display = returning?.train ?? selected;
    if (display) L.polyline(routeLatLngs(display.route, display.edgeIdx), { color: "#fff", weight: 9, opacity: 0.45, dashArray: returning ? "6 6" : undefined }).addTo(g);
    if (selected && preview) {
      const css = getComputedStyle(document.documentElement);
      L.polyline(routeLatLngs(preview), { color: css.getPropertyValue("--primary"), weight: 6, dashArray: "8 6" }).addTo(g);
    }
  }, [selected, preview, returns]);

  // Reuse markers across ticks: only move them and swap icon/tooltip when their look changes.
  const markers = useRef(new Map<string, { mk: L.Marker; icon: string; tip: string }>());
  useEffect(() => {
    const g = trainLayer.current;
    if (!g) return;
    const css = getComputedStyle(document.documentElement);
    const col = { green: css.getPropertyValue("--ok"), yellow: css.getPropertyValue("--warn"), red: css.getPropertyValue("--late") };
    const ind = css.getPropertyValue("--track-ind");
    const seen = new Set<string>();
    for (const t of trains) {
      const isRemoved = removed.has(t.id);
      const returning = returns[t.id];
      const display = returning?.train ?? t;
      const d = delays.get(t.id) ?? 0;
      const c = isRemoved ? ind : col[statusOf(d)];
      const big = t.product.startsWith("national");
      const w = big ? 22 : 17;
      const station = STATION[display.route.stations[0] ?? ""];
      const location: [number, number] | null = display.route.edges.length ? position(display) : station ? [station.lat, station.lon] : null;
      if (!location) continue;
      seen.add(t.id);
      const sel = selected?.id === t.id;
      const iconKey = `${c}|${big}|${isRemoved && !returning}|${sel}`;
      const returnLabel = returning ? `${returning.status === "depot" ? "At depot" : "Returning to depot"} · ${display.direction} · no passengers` : null;
      const tip = `<b>${t.name}</b> → ${returning ? display.direction : t.direction}<br/>${returnLabel ?? (isRemoved ? "removed" : `delay: ${Math.round(d)} min`)}<br/><i>select to view options</i>`;
      const z = sel ? 2000 : isRemoved ? -1000 : statusOf(d) === "red" ? 500 : 0;
      let entry = markers.current.get(t.id);
      if (!entry) {
        const mk = L.marker(location, { title: t.name });
        mk.on("click", () => selectRef.current(t.id));
        mk.bindTooltip(tip);
        mk.addTo(g);
        entry = { mk, icon: "", tip };
        markers.current.set(t.id, entry);
      } else {
        const cur = entry.mk.getLatLng();
        if (cur.lat !== location[0] || cur.lng !== location[1]) entry.mk.setLatLng(location);
        if (entry.tip !== tip) { entry.mk.setTooltipContent(tip); entry.tip = tip; }
      }
      if (entry.icon !== iconKey) {
        entry.mk.setIcon(L.divIcon({ html: trainSvg(c, big, isRemoved && !returning, sel), className: "", iconSize: [w, w], iconAnchor: [w / 2, w / 2] }));
        entry.mk.setZIndexOffset(z);
        entry.icon = iconKey;
      }
    }
    for (const [id, e] of markers.current) if (!seen.has(id)) { g.removeLayer(e.mk); markers.current.delete(id); }
  }, [trains, delays, removed, selected, returns]);

  return <div ref={el} className="h-full w-full" />;
}
