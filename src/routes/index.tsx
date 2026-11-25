import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { delayedOver, simulate, summarize, syntheticTrains, statusOf, reroute, destination, nextStation, remainingEdges, WEEKDAYS, type Train } from "@/lib/sim";
import { getLiveTrains } from "@/lib/live.functions";
import { registerNetwork } from "@/lib/network";
import { alternatives, routeMinutes, EDGE, TRACK_LABEL, type Route as NetRoute, type TrackType } from "@/lib/network";

import { Button } from "@/components/ui/button";
import { TrainComparison } from "@/components/TrainComparison";
import { PassengerBalance } from "@/components/PassengerBalance";
import LineDiagram from "@/components/LineDiagram";
import { clockLabel, compareDay, initialTimeline, progress, removeTrains, restore, reviewReturn, scenarioTrains, scenarioDelays, incidentsOf, affectedTrains, breakDown, slowSection, resolveIncident, detour, detourRoute, turnBack, heldTrains, blockLimit, recoveredOf, recoveryReset, resetsOf, opsOf } from "@/lib/timeline";
import { nextService } from "@/lib/rotation";
import { DEPOTS, stockKey, HEADWAY, PREP_MIN, PASSENGERS, netPassengerMinutes, recentDispatches, suggestOptions, type OptionKind } from "@/lib/depots";
const OPTION_LABEL: Record<OptionKind, string> = { keep: "Keep in service", reserve: "Stop and call a reserve", transfer: "Stop and transfer to next service" };

const RailMap = lazy(() => import("@/components/RailMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Malha DB — German Rail Network Simulator" },
      { name: "description", content: "Explore Deutsche Bahn trains and delays, then simulate changes to the German rail network." },
      { property: "og:title", content: "Malha DB — Rail Network Simulator" },
      { property: "og:description", content: "Compare a captured train feed with simulated interventions, delays and passenger outcomes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const LABEL: Record<string, string> = { nationalExpress: "ICE", national: "IC/EC", regional: "Regional", regionalExpress: "RE", suburban: "S-Bahn" };

function Index() {
  const [state, setState] = useState(initialTimeline);
  const { original, overrides, removed, pending } = state;
  const setRemoved = (fn: Set<string> | ((p: Set<string>) => Set<string>)) => setState(s => ({ ...s, removed: typeof fn === "function" ? fn(s.removed) : fn }));
  const setOverrides = (fn: Record<string, Train> | ((o: Record<string, Train>) => Record<string, Train>)) => setState(s => ({ ...s, overrides: typeof fn === "function" ? fn(s.overrides) : fn }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<NetRoute | null>(null);
  const [view, setView] = useState<"map" | "lines">("map");
  const trains = useMemo(() => scenarioTrains(state), [state]);
  const [source, setSource] = useState<"loading" | "live" | "sim">("loading");
  const [mounted, setMounted] = useState(false);
  const [updated, setUpdated] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const { trains: loaded, error, stations, edges } = await getLiveTrains();
      if (error || !loaded.length) throw new Error(error ?? "vazio");
      registerNetwork(stations, edges);
      setState(s => s.original.length ? s : { ...s, original: loaded });
      setSource("live");
    } catch {
      setState(s => s.original.length ? s : { ...s, original: syntheticTrains() });
      setSource("sim");
    }
    setUpdated(new Date().toLocaleTimeString("en-GB"));
  }, []);
  useEffect(() => { setMounted(true); load(); }, [load]);

  const [speed, setSpeed] = useState(30);
  const [autoDay, setAutoDay] = useState(false);
  const day = Math.floor(state.minute / 1440);
  useEffect(() => {
    if (!speed && !autoDay) return;
    const id = setInterval(() => setState(s => s.original.length ? progress(s, autoDay ? 60 : speed / 120) : s), 500);
    return () => clearInterval(id);
  }, [speed, autoDay]);
  const nextDay = () => setState(s => progress(s, 1440));
  const history = state.history.map(rows => {
    const active = rows.filter(r => r.after !== null);
    return { day: rows[0]?.day ?? 0,
      base: Math.round(100 * rows.filter(r => r.before <= 0.5).length / Math.max(1, rows.length)),
      scen: Math.round(100 * active.filter(r => (r.after ?? 0) <= 0.5).length / Math.max(1, active.length)),
      avgB: rows.reduce((sum, r) => sum + r.before, 0) / Math.max(1, rows.length),
      avgS: active.reduce((sum, r) => sum + (r.after ?? 0), 0) / Math.max(1, active.length) };
  });
  const comparison = useMemo(() => compareDay(state), [state]);
  const stopNext = (t: Train, mode: "remove" | "replace" | "transfer") => setState(s => ({ ...s, pending: { ...s.pending, [t.id]: { mode, idx: t.edgeIdx, at: nextStation(t) } } }));
  const cancelStop = (id: string) => setState(s => { const pending = { ...s.pending }; delete pending[id]; return { ...s, pending }; });
  const restoreTrain = (id: string) => setState(s => restore(s, id));
  const restoreAll = () => setState(s => restore(s));

  const baseline = useMemo(() => summarize(simulate(original.filter((t) => !t.id.endsWith("-sub")), new Set())), [original]);
  const delays = useMemo(() => scenarioDelays(state), [state]);
  const now = summarize(delays);

  const toggle = (id: string) => setState(s => s.removed.has(id) ? restore(s, id) : removeTrains(s, [id]));
  const removeWhere = (fn: (t: Train) => boolean) => setState(s => removeTrains(s, trains.filter(fn).map(t => t.id)));

  const selected = trains.find((t) => t.id === selectedId) ?? null;
  const selectedReturn = selected ? state.returns[selected.id] : undefined;
  const selectedReentry = selected ? state.reentries[selected.id] : undefined;
  const selectedStop = selected ? pending[selected.id] : undefined;
  const pendingOption = selected && selectedStop && selectedStop.mode !== "remove"
    ? suggestOptions(selectedStop.at, selected.product, selected.baseDelay + (selected.extra ?? 0), state.stock).options.find(o => o.kind === (selectedStop.mode === "replace" ? "reserve" : "transfer"))
    : undefined;
  const passengerForecast = selected && pendingOption ? { option: pendingOption, passengers: PASSENGERS[selected.product] ?? 200 } : undefined;
  const alts = useMemo(() => {
    if (!selected || selected.route.edges.length <= selected.edgeIdx + 1) return [];
    return alternatives(nextStation(selected), destination(selected), remainingEdges(selected));
  }, [selected]);
  const select = useCallback((id: string) => { setSelectedId(id); setPreview(null); }, []);
  const applyAlt = (r: NetRoute) => { if (!selected) return; setOverrides((o) => ({ ...o, [selected.id]: reroute(selected, r) })); setPreview(null); };
  const resetRoute = (id: string) => setOverrides((o) => { const n = { ...o }; delete n[id]; return n; });
  const incidents = incidentsOf(state);
  const affected = useMemo(() => affectedTrains(state), [state]);
  const held = useMemo(() => heldTrains(state), [state]);
  const randomBreakdown = () => { const pool = trains.filter(t => !removed.has(t.id) && !t.id.endsWith("-sub") && !incidents.some(i => i.trainId === t.id)); const t = pool[Math.floor(Math.random() * pool.length)]; if (t) setState(s => breakDown(s, t.id)); };
  const randomSlow = () => { const count: Record<string, number> = {}; trains.filter(t => !removed.has(t.id)).forEach(t => { const e = t.route.edges[t.edgeIdx]!; count[e] = (count[e] ?? 0) + 1; }); const busy = Object.entries(count).filter(([e]) => !incidents.some(i => i.edge === e)).sort((a, b) => b[1] - a[1]).slice(0, 5); const pick = busy[Math.floor(Math.random() * busy.length)]; if (pick) setState(s => slowSection(s, pick[0])); };
  const edgeName = (id: string) => { const e = EDGE[id]; return e ? `${e.a}–${e.b}` : id; };
  const rerouted = Object.values(overrides).filter(t => t.extra !== undefined).length;

  const worst = useMemo(() => trains.filter((t) => !removed.has(t.id)).sort((a, b) => (delays.get(b.id) ?? 0) - (delays.get(a.id) ?? 0)).slice(0, 8), [trains, removed, delays]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelectedId(null); setPreview(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground md:flex-row">
      <aside className={`flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4 md:w-96 ${view === "lines" ? "max-h-[25vh] md:max-h-none md:w-80" : ""}`}>
        <header>
          <h1 className="font-mono text-xl font-bold tracking-tight">MALHA·DB</h1>
          <p className="text-xs text-muted-foreground">
            {source === "loading" ? "Loading DB train data…" : source === "live" ? `Simulation from DB data · captured ${updated} · ${trains.length} trains` : "DB feed unavailable — using simulated data"}
          </p>
        </header>

        <div className="flex items-center gap-1 font-mono text-xs">
          <span className="mr-1 text-muted-foreground">Speed:</span>
          {[0, 1, 30, 120].map((v) => (
            <button key={v} onClick={() => { setSpeed(v); setAutoDay(false); }} className={`rounded border border-border px-2 py-1 ${speed === v ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{v === 0 ? "❚❚" : `${v}×`}</button>
          ))}
        </div>

        <section className="rounded-md border border-border bg-card p-3 text-xs">
          <div className="mb-2 flex items-center justify-between font-mono">
            <span className="text-sm font-bold">Day {day + 1} · {WEEKDAYS[day % 7]} · {clockLabel(state.minute).split(" ")[1]} <span className="text-muted-foreground">(week {Math.floor(day / 7) + 1})</span></span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Btn disabled={!original.length} onClick={nextDay}>+1 day</Btn>
            <Btn disabled={!original.length} onClick={() => setState(s => progress(s, 7 * 1440))}>+7 days</Btn>
            <Btn disabled={!original.length} onClick={() => setAutoDay((a) => !a)}>{autoDay ? "❚❚ cycle" : "▶ daily cycle"}</Btn>
          </div>
          {history.length > 0 && (
            <div className="mt-3">
              <div className="flex h-16 items-end gap-0.5">
                {history.map((h) => (
                  <div key={h.day} title={`Day ${h.day + 1} (${WEEKDAYS[h.day % 7]}): original ${h.base}% → scenario ${h.scen}%`} className="relative flex h-full flex-1 items-end">
                    <div className="absolute bottom-0 w-full rounded-t bg-muted" style={{ height: `${h.base}%` }} />
                    <div className="relative w-1/2 rounded-t bg-primary" style={{ height: `${h.scen}%`, marginLeft: "25%" }} />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Daily punctuality: gray = baseline, color = your scenario. Average: {Math.round(history.reduce((a, h) => a + h.base, 0) / history.length)}% → <b className="text-primary">{Math.round(history.reduce((a, h) => a + h.scen, 0) / history.length)}%</b> · average delay {Math.round(history.reduce((a, h) => a + h.avgB, 0) / history.length * 10) / 10} → {Math.round(history.reduce((a, h) => a + h.avgS, 0) / history.length * 10) / 10} min</p>
              <button onClick={() => setState(s => ({ ...s, history: [] }))} className="text-[10px] text-primary hover:underline">clear history</button>
            </div>
          )}
        </section>

        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <Stat c="text-ok" v={now.green} l="on time" />
          <Stat c="text-warn" v={now.yellow} l="≤10 min" />
          <Stat c="text-late" v={now.red} l=">10 min" />
        </div>

        <div className="rounded-md border border-border bg-card p-3 font-mono text-sm">
          <Row l="Punctuality" a={`${baseline.punctuality}%`} b={`${now.punctuality}%`} />
          <Row l="Average delay" a={`${baseline.avg} min`} b={`${now.avg} min`} />
          <Row l="Active trains" a={baseline.total} b={now.total} />
          <Row l="Returning to depot" a={0} b={Object.values(state.returns).filter(r => r.status === "returning").length} />
          <Row l="Changed routes" a={0} b={rerouted} />
          {(() => {
            const ops = opsOf(state);
            const services = baseline.total || 1;
            const cancelled = state.dispatches.filter(d => d.kind === "cancel" || (!d.depot && d.kind !== "transfer")).length;
            return <>
              <Row l="Cancellations" a="0%" b={`${Math.round(cancelled / services * 1000) / 10}% (${cancelled})`} />
              <Row l="Inherited delay" a="—" b={`${Math.round(ops.inherited)} min`} />
              <Row l="Inheritance avoided" a={0} b={`${Math.round(ops.avoided)} min`} />
            </>;
          })()}
          <p className="mt-1 text-[10px] text-muted-foreground">baseline → current scenario</p>
        </div>

        <section className="border-t border-border pt-3">
          <label htmlFor="train-select" className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">Train details</label>
          <select id="train-select" value={selectedId ?? ""} onChange={e => select(e.target.value)} className="w-full rounded-md border border-input bg-secondary p-2 text-xs text-foreground">
            <option value="">Select a train</option>
            {original.filter(t => !t.id.endsWith("-sub")).map(t => <option key={t.id} value={t.id}>{t.name} → {destination(t)}</option>)}
          </select>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase text-muted-foreground">Scenarios</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Btn onClick={() => removeWhere((t) => statusOf(t.baseDelay) === "red")}>Remove delayed &gt;10</Btn>
            <Btn onClick={() => removeWhere(delayedOver(30))}>Remove delayed &gt;30</Btn>
            <Btn onClick={() => removeWhere((t) => t.product.startsWith("regional"))}>Remove regional</Btn>
            <Btn onClick={() => removeWhere((t) => t.product === "suburban")}>Remove S-Bahn</Btn>
            <div className="col-span-2"><Btn onClick={restoreAll}>Restore all</Btn></div>
          </div>
          <p className="text-[11px] text-muted-foreground">Select a train on the map to remove it, restore it or change its route.</p>
        </section>

        <section className="space-y-2 rounded-md border border-border bg-card p-3 text-xs">
          <h2 className="font-semibold uppercase text-muted-foreground">Network incidents</h2>
          <label className="block text-[11px] text-muted-foreground">Choose a train to break down
            <select aria-label="Train for breakdown" className="mt-1 w-full rounded border border-border bg-background p-1 font-mono text-xs text-foreground" value="" onChange={(e) => { const id = e.target.value; if (id) { setState(s => breakDown(s, id)); select(id); } }}>
              <option value="">— select a train —</option>
              {trains.filter(t => !removed.has(t.id) && !incidents.some(i => i.trainId === t.id)).sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                <option key={t.id} value={t.id}>{t.name} · {edgeName(t.route.edges[t.edgeIdx]!)}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={randomBreakdown}>⚠ Random breakdown</Btn>
            <Btn onClick={randomSlow}>🚧 Section slowdown</Btn>
          </div>
          {incidents.length === 0 ? <p className="text-[11px] text-muted-foreground">No active incidents. A broken-down train blocks its track: following trains on that section (or approaching it) stop and wait (+20 min); a slowdown adds +15 min to trains using the section.</p> : (
            <ul className="space-y-1">
              {incidents.map(i => (
                <li key={i.id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                  <button className="truncate text-left hover:underline" onClick={() => i.trainId && select(i.trainId)}>
                    {i.kind === "broken" ? `⚠ ${trains.find(t => t.id === i.trainId)?.name ?? "train"} broken down · track ${edgeName(i.edge)} (${TRACK_LABEL[EDGE[i.edge]?.type as TrackType] ?? ""}) · ${held.filter(h => h.incident.id === i.id).length} held behind · elapsed ${Math.round(state.minute - i.since)} min` : `🚧 Slowdown ${edgeName(i.edge)} · +${i.extra} min`}
                  </button>
                  <button className="shrink-0 text-primary hover:underline" onClick={() => setState(s => resolveIncident(s, i.id))}>{i.kind === "broken" ? "repair" : "clear"}</button>
                </li>
              ))}
              <li><button className="text-primary hover:underline" onClick={() => setState(s => resolveIncident(s))}>Resolve all</button></li>
            </ul>
          )}
          {affected.length > 0 && (
            <div className="space-y-1 border-t border-border pt-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Affected trains ({affected.length})</span>
                <button className="text-primary hover:underline" onClick={() => setState(s => affected.reduce((acc, a) => detour(acc, a.train.id), s))}>Reroute where possible</button>
              </div>
              <ul className="space-y-1">
                {affected.map(({ train, incident }) => {
                  const canDetour = !!detourRoute(state, train);
                  return (
                    <li key={train.id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <button className="truncate text-left hover:underline" onClick={() => select(train.id)}>{train.name} → {destination(train)} · {held.some(h => h.train.id === train.id) ? "⏸ held behind breakdown" : incident.kind === "broken" ? "approaching blocked track" : "slowed"}</button>
                      <span className="flex shrink-0 gap-2">
                        <button disabled={!canDetour} title={canDetour ? "Use another line, same destination" : "No alternative route"} className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" onClick={() => setState(s => detour(s, train.id))}>reroute</button>
                        <button className="text-primary hover:underline" title="Turn back to the origin" onClick={() => setState(s => turnBack(s, train.id))}>turn back</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-md border border-border bg-card p-3 text-xs">
          <h2 className="mb-2 font-semibold uppercase text-muted-foreground">Depots · reserve trains</h2>
          <ul className="grid grid-cols-2 gap-1 font-mono text-[11px]">
            {DEPOTS.map(d => (
              <li key={d.id} className="flex justify-between rounded bg-secondary px-2 py-1">
                <span className="truncate">{d.station}</span>
                <span>{(["nationalExpress", "regional"] as const).map(p => { const k = stockKey(d.id, p); const v = state.stock[k] ?? 0; return <b key={k} title={p === "regional" ? "regional" : "long-distance"} className={`ml-1 ${v === 0 ? "text-late" : "text-ok"}`}>{p === "regional" ? "R" : "L"}{v}/{d.capacity}</b>; })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-muted-foreground">"Stop and replace" calls a reserve from the nearest depot with an available train: {PREP_MIN} min preparation + travel. L = long-distance (ICE/IC), R = regional; each fleet replaces only its own category. With no reserve, the train is cancelled. Reserves return to depots overnight.</p>
          {Object.keys(state.returns).length > 0 && <div className="mt-3 border-t border-border pt-2" aria-label="Returning trains">
            <h3 className="mb-1 font-semibold">Replaced units · return movements</h3>
            <ul className="space-y-2">{Object.values(state.returns).map(r => <li key={r.trainId}>
              <Button variant="link" size="sm" className="h-auto whitespace-normal px-0 py-0 text-xs" onClick={() => select(r.trainId)}>{r.train.name} → {r.train.direction}</Button>
              <div className="text-muted-foreground">{r.status === "returning" ? `Returning empty · estimated arrival ${clockLabel(r.arrival)} · remaining ${Math.max(0, Math.ceil(r.arrival - state.minute))} min` : "At depot · awaiting inspection"}</div>
              {r.status === "depot" && <div className="mt-1 flex flex-wrap gap-2">
                <Btn onClick={() => setState(s => reviewReturn(s, r.trainId, true))}>Approve inspection · add to reserve</Btn>
                <Btn onClick={() => setState(s => reviewReturn(s, r.trainId, false))}>Keep out of service</Btn>
              </div>}
            </li>)}</ul>
            <p className="mt-1 text-[10px] text-muted-foreground">The returning train occupies track until arrival; after arrival, approve its inspection to add it to depot reserves. Route and times are estimates.</p>
          </div>}
          {state.dispatches.length > 0 && (() => {
            const total = state.dispatches.reduce((a, d) => a + netPassengerMinutes(d), 0);
            return (
              <div className="mt-2 border-t border-border pt-2">
                <h3 className="mb-1 font-semibold">Latest 6 records · {state.dispatches.length} total</h3>
                <ul aria-label="Recent replacements and passenger balances" className="space-y-1 font-mono text-[11px]">
                  {recentDispatches(state.dispatches).map((d, i) => {
                    const net = netPassengerMinutes(d);
                    return (
                      <li key={i} className="rounded bg-secondary px-2 py-1">
                        <div>{d.name} at {d.station}</div>
                        <div className="text-muted-foreground">
                          {d.kind === "transfer" ? `passengers on next service · wait ${d.wait} min · delay avoided ${d.delayAvoided} min` : d.kind === "cancel" ? "removed without onward travel — trip cancelled" : d.kind === "reset" ? `Recovery Reset · reserve from ${DEPOTS.find(x => x.id === d.depot)?.station} takes the next trip · inherited delay avoided ${d.delayAvoided} min` : d.depot ? `reserve from ${DEPOTS.find(x => x.id === d.depot)?.station} · wait ${d.wait} min · delay avoided ${d.delayAvoided} min` : "no reserve available — cancelled"}
                        </div>
                        <div className={net >= 0 ? "text-ok" : "text-late"}>{d.passengers} passengers · {net >= 0 ? "+" : ""}{Math.round(net / 60)} passenger-hours</div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 font-mono">Balance: <b className={total >= 0 ? "text-ok" : "text-late"}>{total >= 0 ? "+" : ""}{Math.round(total / 60)} passenger-hours</b> <span className="text-muted-foreground">(positive = time saved)</span></p>
              </div>
            );
          })()}
        </section>


        {removed.size > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground">Removed ({removed.size})</h2>
              <button onClick={restoreAll} className="text-xs text-primary hover:underline">Restore all trains</button>
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
              {trains.filter((t) => removed.has(t.id)).map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded bg-card px-2 py-1">
                  <span className="truncate">{t.name} <span className="text-muted-foreground">→ {t.direction}</span></span>
                  {trains.some((x) => x.id === `${t.id}-sub`) && <span className="ml-1 shrink-0 text-muted-foreground">replaced</span>}
                  {state.reentries[t.id] !== undefined ? <span className="ml-2 text-primary">Departure {clockLabel(state.reentries[t.id] ?? state.minute)}</span> : <Button variant="link" size="sm" onClick={() => restoreTrain(t.id)} className="ml-2 h-auto shrink-0 px-0 py-0 text-ok">↺ restore</Button>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Most delayed now</h2>
          <ul className="space-y-1 font-mono text-xs">
            {worst.map((t) => (
              <li key={t.id} onClick={() => select(t.id)} className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-secondary ${selectedId === t.id ? "bg-primary/15 ring-1 ring-primary" : "bg-card"}`}>
                <span className="truncate">{t.name} <span className="text-muted-foreground">→ {t.direction} · {LABEL[t.product] ?? t.product}</span></span>
                <button onClick={() => select(t.id)} className="ml-2 shrink-0 text-late hover:underline">{delays.get(t.id)}′ ›</button>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-auto text-[10px] leading-snug text-muted-foreground">
          Model: a delayed train passes some delay to trains sharing upcoming sections. Removing or rerouting it removes this effect; longer routes add travel time.
        </p>
      </aside>
      <main className="relative min-h-[50vh] min-w-0 flex-1">
        <div className="absolute left-14 top-3 z-[1001] flex overflow-hidden rounded-md border border-border bg-card text-xs">
          <button onClick={() => setView("map")} className={`px-3 py-1.5 ${view === "map" ? "bg-primary text-primary-foreground" : ""}`}>🗺️ Map</button>
          <button onClick={() => setView("lines")} className={`px-3 py-1.5 ${view === "lines" ? "bg-primary text-primary-foreground" : ""}`}>🚊 Line diagram</button>
        </div>
        {view === "lines" ? <div className="absolute inset-0"><LineDiagram trains={trains} delays={delays} removed={removed} selectedId={selectedId} onSelect={select} incidents={incidents} heldIds={new Set(held.map(h => h.train.id))} reentries={state.reentries} /></div>
          : mounted && source !== "loading" && <Suspense fallback={null}><RailMap returns={state.returns} trains={trains} delays={delays} removed={removed} selected={selected} preview={preview} onSelect={select} /></Suspense>}
        <div className={`${view === "lines" ? "hidden" : ""} absolute bottom-6 right-3 z-[1000] rounded-md border border-border bg-card/95 p-3 text-xs`}>
          {([["hs", "bg-track-hs"], ["main", "bg-track-main"], ["secondary", "bg-track-sec"], ["industrial", "bg-track-ind"]] as const).map(([k, c]) => (
            <div key={k} className="flex items-center gap-2"><span className={`inline-block h-1.5 w-6 rounded ${c}`} />{TRACK_LABEL[k]}</div>
          ))}
        </div>
      </main>
        {selected && (
          <aside aria-label="Train options" className={`w-full shrink-0 overflow-y-auto border-l border-primary/60 bg-card p-4 text-xs md:w-96 ${view === "lines" ? "fixed inset-y-0 right-0 z-[1100] max-w-[min(24rem,90vw)]" : ""}`}>
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="font-mono text-sm font-bold">{selected.name} → {destination(selected)}</div>
                <div className="text-muted-foreground">
                  {selectedReentry !== undefined ? `Waiting for estimated departure ${clockLabel(selectedReentry)} · own delay 0 min` : removed.has(selected.id) ? "Removed from network" : `Delay ${delays.get(selected.id)} min (own ${selected.baseDelay}${selected.extra ? `, route ${selected.extra > 0 ? "+" : ""}${selected.extra}` : ""})`}
                </div>
              </div>
              <button onClick={() => { setSelectedId(null); setPreview(null); }} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="mb-2 font-mono text-[11px] text-muted-foreground">Route: {selected.route.stations.slice(selected.edgeIdx).join(" → ")}</p>
            {selectedReturn && <div className="mb-3 border-l-2 border-border pl-2" aria-label="Depot return">
              <b>{selectedReturn.status === "returning" ? "Returning to depot" : "At depot"} · {DEPOTS.find(d => d.id === selectedReturn.depot)?.name}</b>
              <p className="text-muted-foreground">Sem passengers · {selectedReturn.train.route.stations.join(" → ")}</p>
              <p className="font-mono">{selectedReturn.status === "returning" ? `Estimated arrival ${clockLabel(selectedReturn.arrival)} · remaining ${Math.max(0, Math.ceil(selectedReturn.arrival - state.minute))} min` : `Arrived at ${clockLabel(selectedReturn.arrival)} · awaiting inspection`}</p>
              {selectedReturn.status === "depot" && <div className="mt-1 flex flex-wrap gap-2">
                <Btn onClick={() => setState(s => reviewReturn(s, selected.id, true))}>Approve inspection · add to reserve</Btn>
                <Btn onClick={() => setState(s => reviewReturn(s, selected.id, false))}>Keep out of service</Btn>
              </div>}
            </div>}
            {!removed.has(selected.id) && (() => {
              const block = blockLimit(state, selected);
              const gain = recoveredOf(state)[selected.id] ?? 0;
              const own = scenarioTrains(state).find(t => t.id === selected.id)?.baseDelay ?? 0;
              const msg = block !== null ? "🟡 Caution signal: maintaining block spacing behind the leading train"
                : own > 0 && !incidents.some(i => selected.route.edges.slice(selected.edgeIdx, selected.edgeIdx + 3).includes(i.edge)) ? "⚡ Clear track: running at line speed to recover delay"
                : null;
              return (msg || gain > 0) ? <div className="mb-3 rounded border border-border p-2 text-xs">
                {msg && <div>{msg}</div>}
                {gain > 0 && <div className="text-muted-foreground">Recovered today: {gain.toFixed(1)} min (estimate)</div>}
              </div> : null;
            })()}
            {!removed.has(selected.id) && !selected.id.endsWith("-sub") && (() => {
              const n = nextService(selected, delays.get(selected.id) ?? 0);
              const armed = !!resetsOf(state)[selected.id];
              return <div className="mb-3 rounded border border-border p-2" aria-label="Next service for this unit">
                <h3 className="mb-1 font-semibold uppercase text-muted-foreground">Unit rotation (estimated)</h3>
                <p className="font-mono text-[11px]">Current trip → {n.from} · then <b>{n.name}</b> {n.from} → {n.to}</p>
                <p className="text-muted-foreground">Turnaround time {n.buffer} min · expected inherited delay <b className={n.inherited > 0 ? "text-late" : "text-ok"}>{n.inherited} min</b></p>
                <Btn className="mt-2 w-full" onClick={() => setState(s => recoveryReset(s, selected.id))}>{armed ? "✓ Recovery Reset scheduled · cancel" : "Recovery Reset: finish trip and swap units at terminal"}</Btn>
                {armed && <p className="mt-1 text-primary">On arrival at {n.from}, a matching reserve takes over {n.name} on time; this unit returns empty to the depot. Without an available reserve, delay is inherited.</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">Rotation and next service number are model estimates, not official DB unit diagrams (Umlaufpläne).</p>
              </div>;
            })()}
            <div className="mb-3 flex flex-wrap gap-2">
              <Btn disabled={selectedReentry !== undefined} onClick={() => removed.has(selected.id) ? restoreTrain(selected.id) : toggle(selected.id)}>{selectedReentry !== undefined ? "Departure scheduled" : removed.has(selected.id) ? "↺ Restore to network" : "Remove now"}</Btn>
              {!removed.has(selected.id) && (incidents.some(i => i.trainId === selected.id)
                ? <Btn onClick={() => setState(s => resolveIncident(s, `b-${selected.id}`))}>🔧 Repair train</Btn>
                : <Btn onClick={() => setState(s => breakDown(s, selected.id))}>⚠ Simulate breakdown</Btn>)}
              {!removed.has(selected.id) && <Btn onClick={() => setState(s => turnBack(s, selected.id))}>⟲ Turn back</Btn>}
              {overrides[selected.id]?.extra !== undefined && <Btn onClick={() => resetRoute(selected.id)}>Original route</Btn>}
            </div>
            {selectedReentry !== undefined && <p className="mb-3 text-primary">Estimated departure {clockLabel(selectedReentry)} · remaining {Math.max(0, Math.ceil(selectedReentry - state.minute))} min · headway {HEADWAY[selected.product] ?? 60} min (estimated, not an official DB schedule). Waits out of service and returns with no own delay; track incidents may still affect it.</p>}
            {!removed.has(selected.id) && (pending[selected.id] ? (
              <div className="mb-3 rounded border border-primary bg-primary/10 p-2">⏹ Scheduled to stop at <b>{pending[selected.id]?.at}</b>{pending[selected.id]?.mode === "replace" ? " and be replaced by a reserve from the nearest depot" : pending[selected.id]?.mode === "transfer" ? "; passengers take the next regular service" : ""}. <Button variant="link" size="sm" onClick={() => cancelStop(selected.id)} className="h-auto px-1 py-0 text-xs">cancel</Button>{passengerForecast && <PassengerBalance forecast={passengerForecast} />}</div>
            ) : (
              <>
              {selected.edgeIdx + 1 < selected.route.edges.length && !selected.id.endsWith("-sub") && (() => {
                const own = selected.baseDelay + (selected.extra ?? 0);
                const { options, best } = suggestOptions(nextStation(selected), selected.product, own, state.stock);
                return (
                  <div className="mb-3 rounded border border-border p-2">
                    <h3 className="mb-1 font-semibold uppercase text-muted-foreground">Passenger options at {nextStation(selected)}</h3>
                    <ul className="space-y-1">
                      {options.map(o => (
                        <li key={o.kind}>
                          <button
                            onClick={() => o.kind === "keep" ? cancelStop(selected.id) : stopNext(selected, o.kind === "reserve" ? "replace" : "transfer")}
                            disabled={o.kind !== "keep" && !o.available}
                            className={`w-full rounded px-2 py-1.5 text-left transition-colors ${o.kind === best ? "bg-primary/15 ring-1 ring-primary" : "bg-secondary hover:bg-secondary/60"} disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{o.kind === best ? "★ " : ""}{OPTION_LABEL[o.kind]}</span>
                              <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${o.kind === best ? "bg-primary text-primary-foreground" : "bg-secondary-foreground/10 text-primary"}`}>
                                {o.kind === "keep" ? "keep" : o.available ? "choose" : "unavailable"}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {o.note}{o.kind !== "keep" && o.available ? ` · wait ${o.wait} min · ` : ""}
                              {o.kind !== "keep" && o.available && <span className={o.net >= 0 ? "text-ok" : "text-late"}>{o.net >= 0 ? "+" : ""}{Math.round(o.net / 60)} passenger-hours</span>}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-muted-foreground">★ = most passenger time saved. The decision is yours.</p>
                  </div>
                );
              })()}
              <div className="mb-3 grid grid-cols-1 gap-2">
                <Btn onClick={() => stopNext(selected, "remove")}>Stop only at {nextStation(selected)} (no onward travel)</Btn>
              </div>
              </>
            ))}
            <TrainComparison forecast={passengerForecast} rows={[...state.history.flatMap(rows => rows.filter(r => r.id === selected.id.replace(/-sub$/, ""))), ...comparison.filter(r => r.id === selected.id.replace(/-sub$/, ""))]} />
            <h3 className="mb-1 mt-3 font-semibold uppercase text-muted-foreground">Alternative routes (same destination)</h3>
            {alts.length === 0 ? <p className="text-muted-foreground">No alternative available from {nextStation(selected)}.</p> : (
              <ul className="space-y-1">
                {alts.map((r, i) => {
                  const diff = Math.round(routeMinutes(r.edges) - routeMinutes(remainingEdges(selected)));
                  const types = [...new Set(r.edges.flatMap((e) => EDGE[e] ? [EDGE[e].type] : []))] as TrackType[];
                  return (
                    <li key={i} onMouseEnter={() => setPreview(r)} onMouseLeave={() => setPreview(null)} className="rounded bg-secondary p-2">
                      <div className="font-mono text-[11px]">via {r.stations.slice(1, -1).join(", ") || "direct"}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-muted-foreground">{diff >= 0 ? "+" : ""}{diff} min · {types.map((t) => TRACK_LABEL[t]).join(", ")}</span>
                        <button onClick={() => applyAlt(r)} className="text-primary hover:underline">Use this route</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        )}

    </div>
  );
}

const Stat = ({ c, v, l }: { c: string; v: number; l: string }) => (
  <div className="rounded-md border border-border bg-card p-2"><div className={`text-2xl font-bold ${c}`}>{v}</div><div className="text-[10px] text-muted-foreground">{l}</div></div>
);
const Row = ({ l, a, b }: { l: string; a: React.ReactNode; b: React.ReactNode }) => (
  <div className="flex flex-wrap justify-between gap-x-2"><span className="text-muted-foreground">{l}</span><span>{a} → <b className="text-primary">{b}</b></span></div>
);
const Btn = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <Button variant="secondary" size="sm" {...p} className="h-auto min-h-8 whitespace-normal border border-border px-2 py-2 text-xs" />
);
