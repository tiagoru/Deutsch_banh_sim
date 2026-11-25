import { advance, delayForDay, replacementFor, reroute, simulate, type Train } from "./sim";
import { EDGE, edgeMinutes, shortestRoute, routeMinutes, SPEED } from "./network";
import { HEADWAY, initialStock, PASSENGERS, pickDepot, type Dispatch } from "./depots";
import { inheritedDelay } from "./rotation";

export type Stop = { mode: "remove" | "replace" | "transfer"; idx: number; at: string };
export type DepotReturn = { trainId: string; depot: string; stockKey?: string; train: Train; arrival: number; status: "returning" | "depot" };
export type Comparison = { id: string; name: string; day: number; before: number; after: number | null; scheduled: number; arrivalBefore: number; arrivalAfter: number | null; status: "ativo" | "parada programada" | "parado" | "substituído" | "aguardando intervalo"; service: string };
export type Timeline = { original: Train[]; overrides: Record<string, Train>; removed: Set<string>; pending: Record<string, Stop>; minute: number; history: Comparison[][]; stock: Record<string, number>; dispatches: Dispatch[]; returns: Record<string, DepotReturn>; reentries: Record<string, number> };
export const initialTimeline: Timeline = { original: [], overrides: {}, removed: new Set(), pending: {}, minute: 360, history: [], stock: initialStock(), dispatches: [], returns: {}, reentries: {} };
export const scenarioTrains = (s: Timeline) => s.original.map(t => s.overrides[t.id] ?? t);
/** Empty movements share tracks, but are not counted as passenger services. */
export function scenarioDelays(s: Timeline): Map<string, number> {
  const movements = Object.values(s.returns).filter(r => r.status === "returning").map(r => r.train);
  const delays = simulate([...scenarioTrains(s), ...movements], s.removed);
  for (const r of movements) delays.delete(r.id);
  for (const t of scenarioTrains(s)) if (delays.has(t.id)) delays.set(t.id, Math.round((delays.get(t.id)! + incidentDelay(s, t)) * 10) / 10);
  return delays;
}
function startReturn(t: Train, station: string, minute: number): DepotReturn | null {
  const pick = pickDepot(station, initialStock(), t.product);
  if (!pick) return null;
  const route = shortestRoute(station, pick.depot.station);
  if (!route) return null;
  return { trainId: t.id, depot: pick.depot.id, stockKey: pick.key, arrival: minute + routeMinutes(route.edges), status: route.edges.length ? "returning" : "depot",
    train: { ...t, id: `${t.id}-return`, route, edgeIdx: 0, frac: 0, extra: 0, direction: pick.depot.station } };
}
function advanceReturn(r: DepotReturn, minutes: number): DepotReturn {
  if (r.status === "depot") return r;
  let train = { ...r.train };
  let left = minutes;
  while (left > 0) {
    const edge = EDGE[train.route.edges[train.edgeIdx] ?? ""];
    if (!edge) return { ...r, status: "depot" };
    const duration = edgeMinutes(edge);
    const need = (1 - train.frac) * duration;
    if (left + 1e-9 < need) { train.frac += left / duration; break; }
    left -= need;
    if (train.edgeIdx === train.route.edges.length - 1) return { ...r, train: { ...train, frac: 1 }, status: "depot" };
    train = { ...train, edgeIdx: train.edgeIdx + 1, frac: 0 };
  }
  return { ...r, train };
}
export function remainingMinutes(t: Train): number {
  return t.route.edges.slice(t.edgeIdx).reduce((sum, id, i) => {
    const edge = EDGE[id];
    return sum + (edge ? edgeMinutes(edge) * (i === 0 ? 1 - t.frac : 1) : 0);
  }, 0);
}
export function compareDay(s: Timeline): Comparison[] {
  const originals = s.original.filter(t => !t.id.endsWith("-sub"));
  const before = simulate(originals, new Set());
  const trains = scenarioTrains(s);
  const after = scenarioDelays(s);
  return originals.map(t => {
    const own = trains.find(x => x.id === t.id) ?? t;
    const substitute = trains.find(x => x.id === `${t.id}-sub` && !s.removed.has(x.id));
    const stopped = s.removed.has(t.id);
    const service = stopped ? substitute : own;
    const b = before.get(t.id) ?? 0;
    const a = service ? after.get(service.id) ?? 0 : null;
    const scheduled = s.minute + remainingMinutes(t);
    return { id: t.id, name: t.name, day: Math.floor(s.minute / 1440), before: b, after: a, scheduled,
      arrivalBefore: scheduled + b,
      arrivalAfter: service && a !== null ? s.minute + remainingMinutes(service) + a : null,
      status: s.reentries[t.id] !== undefined ? "aguardando intervalo" : stopped ? substitute ? "substituído" : "parado" : s.pending[t.id] ? "parada programada" : "ativo",
      service: service?.name ?? "Sem composição" };
  });
}
/** Progress both worlds by identical time, stopping exactly at the requested station. */
function releaseReentries(s: Timeline): Timeline {
  const due = Object.entries(s.reentries).filter(([, at]) => at <= s.minute + 1e-9);
  if (!due.length) return s;
  const removed = new Set(s.removed);
  const reentries = { ...s.reentries };
  const overrides = { ...s.overrides };
  for (const [id] of due) {
    removed.delete(id);
    delete reentries[id];
    const train = overrides[id];
    if (train) overrides[id] = { ...train, baseDelay: 0, extra: 0 };
  }
  return { ...s, removed, reentries, overrides };
}
export function progress(s: Timeline, minutes: number): Timeline {
  let state = releaseReentries(s);
  let left = Math.max(0, minutes);
  while (left > 0) {
    const dayEnd = (Math.floor(state.minute / 1440) + 1) * 1440;
    const nextEntry = Math.min(Infinity, ...Object.values(state.reentries));
    const dt = Math.min(left, 10, dayEnd - state.minute, nextEntry - state.minute);
    const removed = new Set(state.removed);
    const pending = { ...state.pending };
    const moved: Record<string, Train> = {};
    const subs: Train[] = [];
    const stock = { ...state.stock };
    const dispatches = [...state.dispatches];
    const broken = brokenIds(state);
    const heldIds = new Set<string>();
    const recoveringIds = new Set<string>();
    const recovered = { ...recoveredOf(state) };
    const resets = { ...resetsOf(state) };
    const ops = { ...opsOf(state) };
    const turned = new Set<string>();
    const returns = Object.fromEntries(Object.entries(state.returns).map(([id, r]) => [id, advanceReturn(r, dt)]));
    for (const t of scenarioTrains(state)) {
      if (removed.has(t.id) || broken.has(t.id)) { moved[t.id] = t; continue; }
      const p = pending[t.id];
      const edge = EDGE[t.route.edges[t.edgeIdx] ?? ""];
      const until = edge ? (1 - t.frac) * edgeMinutes(edge) : Infinity;
      if (p && until <= dt + 1e-9) {
        moved[t.id] = { ...t, frac: 1 };
        removed.add(t.id);
        delete pending[t.id];
        if (p.mode === "remove") dispatches.push(cancellation(t, t.route.stations[t.edgeIdx + 1] ?? p.at));
        if (p.mode === "transfer") {
          const station = t.route.stations[t.edgeIdx + 1] ?? p.at;
          dispatches.push({ trainId: t.id, name: t.name, station, depot: null, kind: "transfer", wait: HEADWAY[t.product] ?? 60, delayAvoided: t.baseDelay + (t.extra ?? 0), passengers: PASSENGERS[t.product] ?? 200 });
          // The next scheduled regular train takes over the rest of the route on time; no reserve stock is used.
          const next = replacementFor(t, t.edgeIdx + 1);
          if (next && !state.original.some(x => x.id === next.id)) subs.push(advance({ ...next, name: `${t.name}S` }, Math.max(0, dt - until)));
        }
        if (p.mode === "replace") {
          const station = t.route.stations[t.edgeIdx + 1] ?? p.at;
          const pick = pickDepot(station, stock, t.product);
          const base = { trainId: t.id, name: t.name, station, delayAvoided: t.baseDelay + (t.extra ?? 0), passengers: PASSENGERS[t.product] ?? 200 };
          const sub = pick ? replacementFor(t, t.edgeIdx + 1) : null;
          if (pick && sub && !state.original.some(x => x.id === sub.id)) {
            stock[pick.key] = (stock[pick.key] ?? 0) - 1;
            dispatches.push({ ...base, depot: pick.depot.id, stockKey: pick.key, wait: pick.wait });
            // Passengers wait on the platform for the reserve; it then runs on time.
            subs.push(advance({ ...sub, baseDelay: pick.wait }, Math.max(0, dt - until)));
            const returning = startReturn(t, station, state.minute + until);
            if (returning) returns[t.id] = advanceReturn(returning, Math.max(0, dt - until));
          } else dispatches.push({ ...base, depot: null, wait: 0 });
        }
      } else {
        const hold = holdLimit(state, t);
        const block = blockLimit(state, t);
        const limit = hold === null ? block : block === null ? hold : Math.min(hold, block);
        // Free track with a delay: run at line maximum speed and win back time.
        const free = limit === null && !incidentsOf(state).some(i => upcoming(t).includes(i.edge));
        const gain = free && t.baseDelay > 0 ? Math.min(t.baseDelay, dt * RECOVERY_RATE) : 0;
        const next = advance(t, dt + gain);
        if (gain > 0) { recoveringIds.add(t.id); recovered[t.id] = Math.round(((recovered[t.id] ?? 0) + gain) * 10) / 10; }
        // Time spent stopped behind a broken train is real lost time: it stays in the train's own delay.
        let out = limit !== null && (next.edgeIdx !== t.edgeIdx || next.route !== t.route || next.frac > limit) ? (heldIds.add(t.id), { ...t, frac: Math.max(t.frac, limit), baseDelay: hold !== null && hold <= (block ?? Infinity) ? Math.round((t.baseDelay + dt) * 10) / 10 : t.baseDelay })
          : gain > 0 ? { ...next, baseDelay: Math.round((t.baseDelay - gain) * 10) / 10 } : next;
        if (out.route !== t.route && !heldIds.has(t.id)) {
          // Terminal reached: the same unit runs its next service after the turnaround buffer.
          const arrivalDelay = t.baseDelay - gain + (t.extra ?? 0);
          const inherited = inheritedDelay(arrivalDelay, t.product);
          const terminal = t.route.stations.at(-1)!;
          const pick = resets[t.id] ? pickDepot(terminal, stock, t.product) : null;
          if (pick) {
            // Recovery Reset: a matching reserve takes over the next service on time; the late unit goes to the depot.
            stock[pick.key] = (stock[pick.key] ?? 0) - 1;
            dispatches.push({ trainId: t.id, name: t.name, station: terminal, depot: pick.depot.id, stockKey: pick.key, kind: "reset", wait: 0, delayAvoided: inherited, passengers: PASSENGERS[t.product] ?? 200 });
            ops.avoided += inherited;
            const returning = startReturn(t, terminal, state.minute + dt);
            if (returning) returns[t.id] = returning;
            out = { ...out, baseDelay: 0, extra: 0 };
          } else {
            ops.inherited += inherited;
            out = { ...out, baseDelay: inherited, extra: 0 };
          }
          if (resets[t.id]) { delete resets[t.id]; if (!pick) ops.failed += 1; }
          turned.add(t.id);
        }
        moved[t.id] = out;
      }
    }
    const original = [...state.original.map(t => t.id.endsWith("-sub") ? moved[t.id] ?? t : turnaround(t, advance(t, dt))), ...subs];
    const overrides = Object.fromEntries(Object.entries(moved).filter(([id]) => !id.endsWith("-sub") && (state.overrides[id] || removed.has(id) || heldIds.has(id) || recoveringIds.has(id) || turned.has(id))));
    // Capture the completed day's comparison before the next day's delays are drawn.
    const end = releaseReentries({ ...state, original, overrides, removed, pending, stock, dispatches, returns, minute: state.minute + dt, recovered, resets, ops } as Timeline);
    if (end.minute === dayEnd) {
      const rows = compareDay({ ...end, minute: dayEnd - 0.001 }).map(r => ({ ...r, day: Math.floor(state.minute / 1440) }));
      const day = Math.floor(dayEnd / 1440);
      const apply = (t: Train) => ({ ...t, baseDelay: t.id.endsWith("-sub") ? 0 : delayForDay(t.id, day) });
      // Reserves return to their depots overnight.
      state = { ...end, recovered: {}, stock: initialStock(), original: original.map(apply), overrides: Object.fromEntries(Object.entries(end.overrides).map(([id, t]) => [id, end.reentries[id] !== undefined || state.reentries[id] !== undefined ? { ...t, baseDelay: 0, extra: 0 } : apply(t)])), history: [...state.history, rows].slice(-28) } as Timeline;
    } else state = end;
    left -= dt;
  }
  return state;
}
/** A train taken off without a solution strands its passengers: counted as a cancelled trip in the balance. */
export const cancellation = (t: Train, station: string): Dispatch => ({ trainId: t.id, name: t.name, station, depot: null, kind: "cancel", wait: 0, delayAvoided: 0, passengers: PASSENGERS[t.product] ?? 200 });
export function removeTrains(s: Timeline, ids: string[]): Timeline {
  const trains = scenarioTrains(s).filter(t => ids.includes(t.id) && !s.removed.has(t.id) && !t.id.endsWith("-sub"));
  if (!trains.length) return s;
  const removed = new Set(s.removed);
  trains.forEach(t => removed.add(t.id));
  return { ...s, removed, overrides: { ...s.overrides, ...Object.fromEntries(trains.map(t => [t.id, t])) }, dispatches: [...s.dispatches, ...trains.map(t => cancellation(t, t.route.stations[t.edgeIdx] ?? ""))] };
}
export function restore(s: Timeline, id?: string): Timeline {
  const removed = new Set(s.removed);
  const pending = { ...s.pending };
  const overrides = { ...s.overrides };
  const stock = { ...s.stock };
  const reentries = { ...s.reentries };
  const returning = scenarioTrains(s).filter(t => s.removed.has(t.id) && !t.id.endsWith("-sub") && (!id || t.id === id) && reentries[t.id] === undefined);
  const back = s.dispatches.filter(d => !id || d.trainId === id);
  for (const d of back) {
    const key = d.stockKey ?? d.depot;
    if (key && (d.kind === "reset" || s.original.some(t => t.id === `${d.trainId}-sub`))) stock[key] = Math.min(initialStock()[key] ?? 0, (stock[key] ?? 0) + 1);
  }
  const dispatches = s.dispatches.filter(d => !back.includes(d));
  if (id) { removed.delete(`${id}-sub`); delete pending[id]; if (!s.removed.has(id)) delete overrides[id]; }
  else { for (const key of Object.keys(pending)) delete pending[key]; for (const key of Object.keys(overrides)) if (!removed.has(key)) delete overrides[key]; }
  for (const t of returning) {
    const interval = HEADWAY[t.product] ?? 60;
    reentries[t.id] = (Math.floor(s.minute / interval) + 1) * interval;
    // Restart from the station where service stopped, not the moving baseline position.
    const stationIdx = t.frac === 1 ? t.edgeIdx + 1 : t.edgeIdx;
    const atEnd = stationIdx >= t.route.edges.length;
    const route = atEnd ? { stations: [...t.route.stations].reverse(), edges: [...t.route.edges].reverse() } : t.route;
    overrides[t.id] = { ...t, route, edgeIdx: atEnd ? 0 : stationIdx, frac: 0, baseDelay: 0, extra: 0, direction: route.stations.at(-1) ?? t.direction };
  }
  const returns = { ...s.returns };
  if (id) delete returns[id];
  else for (const key of Object.keys(returns)) delete returns[key];
  const resets = { ...resetsOf(s) };
  if (id) delete resets[id]; else for (const key of Object.keys(resets)) delete resets[key];
  return withIncidents({ ...s, resets, removed, pending, overrides, stock, dispatches, returns, reentries, original: s.original.filter(t => id ? t.id !== `${id}-sub` : !t.id.endsWith("-sub")) } as Timeline, incidentsOf(s).filter(i => !returning.some(t => t.id === i.trainId)));
}
/** Post-return inspection: approve to put the set back into depot stock, or keep it out of service. */
export function reviewReturn(s: Timeline, id: string, approve: boolean): Timeline {
  const r = s.returns[id];
  if (!r || r.status !== "depot") return s;
  const returns = { ...s.returns };
  delete returns[id];
  const stock = { ...s.stock };
  const key = r.stockKey ?? r.depot;
  if (approve) stock[key] = Math.min(initialStock()[key] ?? 0, (stock[key] ?? 0) + 1);
  return { ...s, returns, stock };
}
export function clockLabel(minute: number): string {
  const rounded = Math.round(minute);
  const day = Math.floor(rounded / 1440) + 1;
  const time = ((rounded % 1440) + 1440) % 1440;
  return `D${day} ${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
}
// ---- Network incidents (breakdowns and speed restrictions) ----
/** Minutes added to trains that need a track blocked by a broken-down train. */
export const BLOCK_MIN = 20;
const INCIDENT_LOOKAHEAD = 3;
export type Incident = { id: string; kind: "broken" | "slow"; edge: string; trainId?: string; extra: number; since: number };
export const incidentsOf = (s: Timeline): Incident[] => (s as Timeline & { incidents?: Incident[] }).incidents ?? [];
const withIncidents = (s: Timeline, incidents: Incident[]): Timeline => ({ ...s, incidents } as Timeline);
const brokenIds = (s: Timeline) => new Set(incidentsOf(s).filter(i => i.kind === "broken").map(i => i.trainId!));
const GAP = 0.03;
/** Share of elapsed time a delayed train wins back running at line maximum speed on free track (timetable recovery margin ~8%). */
export const RECOVERY_RATE = 0.08;
/** Minimum spacing between trains on the same track and direction: block length in km by line type (braking distance). */
export const BLOCK_KM: Record<string, number> = { hs: 5, main: 2, secondary: 1.5, industrial: 1 };
export const recoveredOf = (s: Timeline): Record<string, number> => (s as Timeline & { recovered?: Record<string, number> }).recovered ?? {};
const edgeKm = (id: string) => { const e = EDGE[id]; return e ? edgeMinutes(e) / 60 * SPEED[e.type] : 0; };
/** Furthest point a train may reach so it keeps one free block behind the train ahead in the same direction (null = free). */
export function blockLimit(s: Timeline, t: Train): number | null {
  const here = t.route.edges[t.edgeIdx];
  const e = here ? EDGE[here] : undefined;
  if (!e) return null;
  const gap = Math.min(0.5, (BLOCK_KM[e.type] ?? 2) / Math.max(1, edgeKm(here!)));
  const from = t.route.stations[t.edgeIdx];
  let limit: number | null = null;
  for (const o of scenarioTrains(s)) {
    if (o.id === t.id || s.removed.has(o.id) || o.route.edges[o.edgeIdx] !== here || o.route.stations[o.edgeIdx] !== from || o.frac <= t.frac) continue;
    const l = Math.max(t.frac, o.frac - gap);
    if (o.frac - t.frac < gap * 2) limit = limit === null ? l : Math.min(limit, l);
  }
  return limit;
}
/** Furthest point a train may reach on its current track when a broken train blocks it (null = free). */
export function holdLimit(s: Timeline, t: Train): number | null {
  const broken = incidentsOf(s).filter(i => i.kind === "broken" && i.trainId !== t.id);
  if (!broken.length) return null;
  const all = scenarioTrains(s);
  const here = t.route.edges[t.edgeIdx], nextEdge = t.route.edges[t.edgeIdx + 1];
  for (const i of broken) {
    const b = all.find(x => x.id === i.trainId);
    if (!b) continue;
    if (i.edge === here) {
      // Position of the broken train measured in this train's direction of travel.
      const same = b.route.stations[b.edgeIdx] === t.route.stations[t.edgeIdx];
      const pos = same ? b.frac : 1 - b.frac;
      if (t.frac < pos) return Math.max(0, pos - GAP);
    }
    if (i.edge === nextEdge) return 1 - GAP;
  }
  return null;
}
/** Trains physically stopped behind a broken train, with the incident that holds them. */
export function heldTrains(s: Timeline): { train: Train; incident: Incident }[] {
  const out: { train: Train; incident: Incident }[] = [];
  const broken = brokenIds(s);
  const inc = incidentsOf(s).filter(i => i.kind === "broken");
  for (const t of scenarioTrains(s)) {
    if (s.removed.has(t.id) || broken.has(t.id) || holdLimit(s, t) === null) continue;
    const i = inc.find(x => x.edge === t.route.edges[t.edgeIdx] || x.edge === t.route.edges[t.edgeIdx + 1]);
    if (i) out.push({ train: t, incident: i });
  }
  return out;
}
export function breakDown(s: Timeline, id: string): Timeline {
  const t = scenarioTrains(s).find(x => x.id === id);
  if (!t || s.removed.has(id) || brokenIds(s).has(id)) return s;
  const edge = t.route.edges[t.edgeIdx]!;
  return withIncidents({ ...s, overrides: { ...s.overrides, [id]: t } }, [...incidentsOf(s), { id: `b-${id}`, kind: "broken", edge, trainId: id, extra: BLOCK_MIN, since: s.minute }]);
}
export function slowSection(s: Timeline, edge: string, extra = 15): Timeline {
  if (incidentsOf(s).some(i => i.kind === "slow" && i.edge === edge)) return s;
  return withIncidents(s, [...incidentsOf(s), { id: `s-${edge}`, kind: "slow", edge, extra, since: s.minute }]);
}
/** Resolving a breakdown keeps the time lost: the repair wait becomes the train's own delay, recovered gradually afterwards. */
export function resolveIncident(s: Timeline, id?: string): Timeline {
  const gone = incidentsOf(s).filter(i => !id || i.id === id);
  const overrides = { ...s.overrides };
  for (const i of gone) {
    if (i.kind !== "broken" || !i.trainId) continue;
    const t = overrides[i.trainId] ?? s.original.find(x => x.id === i.trainId);
    if (t) overrides[i.trainId] = { ...t, baseDelay: Math.round((t.baseDelay + s.minute - i.since) * 10) / 10 };
  }
  return withIncidents({ ...s, overrides }, incidentsOf(s).filter(i => !gone.includes(i)));
}
/** Edges a train will use soon (current + next ones). */
const upcoming = (t: Train) => t.route.edges.slice(t.edgeIdx, t.edgeIdx + INCIDENT_LOOKAHEAD);
/** Delay each active train gets from incidents: breakdown time, blocked tracks and slow sections. */
export function incidentDelay(s: Timeline, t: Train): number {
  let d = 0;
  for (const i of incidentsOf(s)) {
    if (i.kind === "broken" && i.trainId === t.id) { d += s.minute - i.since; continue; }
    if (upcoming(t).includes(i.edge)) d += i.extra;
  }
  return d;
}
/** Active trains whose next sections pass through an incident. */
export function affectedTrains(s: Timeline): { train: Train; incident: Incident }[] {
  const out: { train: Train; incident: Incident }[] = [];
  const broken = brokenIds(s);
  for (const t of scenarioTrains(s)) {
    if (s.removed.has(t.id) || broken.has(t.id)) continue;
    const inc = incidentsOf(s).find(i => upcoming(t).includes(i.edge));
    if (inc) out.push({ train: t, incident: inc });
  }
  return out;
}
/** Detour around every incident section, keeping the destination. Null if impossible. */
export function detourRoute(s: Timeline, t: Train) {
  const blocked = new Set(incidentsOf(s).map(i => i.edge));
  if (blocked.has(t.route.edges[t.edgeIdx]!)) return null;
  const next = t.route.stations[t.edgeIdx + 1]!, dest = t.route.stations.at(-1)!;
  if (next === dest) return null;
  return shortestRoute(next, dest, blocked);
}
export function detour(s: Timeline, id: string): Timeline {
  const t = scenarioTrains(s).find(x => x.id === id);
  const alt = t && detourRoute(s, t);
  return t && alt ? { ...s, overrides: { ...s.overrides, [id]: reroute(t, alt) } } : s;
}
/** Turn the train around where it is: it heads back to where it came from. */
export function turnBack(s: Timeline, id: string): Timeline {
  const t = scenarioTrains(s).find(x => x.id === id);
  if (!t) return s;
  const route = { stations: [...t.route.stations].reverse(), edges: [...t.route.edges].reverse() };
  const back: Train = { ...t, route, edgeIdx: route.edges.length - 1 - t.edgeIdx, frac: 1 - t.frac, direction: route.stations.at(-1)! };
  return { ...s, overrides: { ...s.overrides, [id]: back } };
}

/** Recovery Reset requests (train id -> true) and operational counters, kept in the atomic timeline. */
export type Ops = { inherited: number; avoided: number; failed: number };
export const resetsOf = (s: Timeline): Record<string, true> => (s as Timeline & { resets?: Record<string, true> }).resets ?? {};
export const opsOf = (s: Timeline): Ops => (s as Timeline & { ops?: Ops }).ops ?? { inherited: 0, avoided: 0, failed: 0 };
/** Baseline rule at the terminal: delay beyond the turnaround buffer carries into the next service. */
export function turnaround(prev: Train, next: Train): Train {
  if (next.route === prev.route) return next;
  return { ...next, baseDelay: inheritedDelay(prev.baseDelay + (prev.extra ?? 0), prev.product), extra: 0 };
}
/** Let the late unit finish this trip, then swap it for a reserve at the terminal (toggle). */
export function recoveryReset(s: Timeline, id: string): Timeline {
  const resets = { ...resetsOf(s) };
  if (resets[id]) delete resets[id]; else resets[id] = true;
  return { ...s, resets } as Timeline;
}
