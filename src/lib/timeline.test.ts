import { describe, expect, it } from "vitest";
import { shortestRoute, EDGE, edgeMinutes } from "./network";
import { breakDown, compareDay, initialTimeline, progress, restore, reviewReturn, scenarioDelays, scenarioTrains, type Timeline } from "./timeline";
import { type Train } from "./sim";
import { DEPOTS, dispatchMinutes, pickDepot } from "./depots";

function fixture(): Timeline {
  const route = shortestRoute("Hamburg", "München");
  if (!route || route.edges.length < 2) throw new Error("Missing test route");
  const t: Train = { id: "a", name: "ICE A", product: "nationalExpress", direction: "München", route, edgeIdx: 0, frac: 0.99, baseDelay: 35 };
  return { ...initialTimeline, original: [t], pending: { a: { mode: "replace", idx: 0, at: route.stations[1] ?? "" } } };
}
describe("daily train comparison", () => {
  it("adds simulated delay to estimated arrival in both scenarios", () => {
    const s = { ...fixture(), pending: {} };
    const edge = EDGE[s.original[0]?.route.edges[0] ?? ""];
    if (!edge) throw new Error("Missing edge");
    const r = compareDay(s)[0];
    if (!r) throw new Error("Missing comparison");
    expect(r.arrivalBefore - r.scheduled).toBeCloseTo(35);
    expect(r.arrivalAfter).toBeCloseTo(r.arrivalBefore);
    expect(r.scheduled).toBeGreaterThan(s.minute + edgeMinutes(edge) * 0.01);
  });
  it("records a separate comparison for each elapsed day", () => {
    const s = progress({ ...fixture(), pending: {} }, 2880);
    expect(Math.floor(s.minute / 1440)).toBe(2);
    expect(s.history.map(rows => rows[0]?.day)).toEqual([0, 1]);
    expect(compareDay(s)[0]?.day).toBe(2);
  });
  it("substitutes from the nearest depot: passengers wait the dispatch time, stock drops, destination kept", () => {
    const s = fixture();
    const edge = EDGE[s.original[0]?.route.edges[0] ?? ""];
    if (!edge) throw new Error("Missing edge");
    const station = s.original[0]!.route.stations[1]!;
    const expected = pickDepot(station, s.stock)!;
    const result = progress(s, edgeMinutes(edge) * 0.01);
    const sub = result.original.find(t => t.id === "a-sub");
    expect(sub?.baseDelay).toBe(expected.wait);
    expect(sub?.route.stations.at(-1)).toBe("München");
    expect(result.stock[expected.depot.id]).toBe(expected.depot.capacity - 1);
    expect(result.dispatches[0]).toMatchObject({ depot: expected.depot.id, wait: expected.wait, delayAvoided: 35 });
    expect(restore(result, "a").stock[expected.depot.id]).toBe(expected.depot.capacity);
  });
  it("puts the next regular train on the route on time when passengers transfer, without using reserves", () => {
    const base = fixture();
    const s = { ...base, pending: { a: { ...base.pending["a"]!, mode: "transfer" as const } } };
    const result = progress(s, 1);
    const next = result.original.find(t => t.id === "a-sub");
    expect(next?.baseDelay).toBe(0);
    expect(next?.route.stations.at(-1)).toBe("München");
    expect(result.removed.has("a")).toBe(true);
    expect(result.stock).toEqual(s.stock);
    expect(restore(result, "a").original.some(t => t.id === "a-sub")).toBe(false);
  });
  it("cancels the service when no depot has a reserve left", () => {
    const s = { ...fixture(), stock: Object.fromEntries(DEPOTS.map(d => [d.id, 0])) };
    const result = progress(s, 1);
    expect(result.original.some(t => t.id === "a-sub")).toBe(false);
    expect(result.dispatches[0]?.depot).toBeNull();
    expect(compareDay(result)[0]?.status).toBe("parado");
  });
  it("dispatch time is 12 min prep at the depot's own station", () => {
    expect(dispatchMinutes(DEPOTS[0]!, DEPOTS[0]!.station)).toBe(12);
  });
  it("stopped services have no estimated arrival, not zero delay", () => {
    const s = fixture();
    s.pending["a"] = { mode: "remove", idx: 0, at: "station" };
    const r = compareDay(progress(s, 10))[0];
    expect(r?.after).toBeNull();
    expect(r?.arrivalAfter).toBeNull();
  });
  it("restores originals and removes replacement compositions", () => {
    const s = restore(progress(fixture(), 10), "a");
    expect(s.removed.size).toBe(1);
    expect(s.original.map(t => t.id)).toEqual(["a"]);
    expect(compareDay(s)[0]?.status).toBe("aguardando intervalo");
    expect(compareDay(progress(s, 50))[0]?.status).toBe("ativo");
  });
  it("returns a substituted train to a depot once, without adding a passenger service or reserve", () => {
    const stopped = progress(fixture(), 1);
    const returning = stopped.returns["a"];
    if (!returning) throw new Error("Missing depot return");
    expect(returning.train.route.stations[0]).toBe(stopped.dispatches[0]?.station);
    expect(returning.train.route.stations.at(-1)).toBe(DEPOTS.find(d => d.id === returning.depot)?.station);
    expect(scenarioDelays(stopped).size).toBe(1);
    expect(scenarioDelays(stopped).has("a-return")).toBe(false);
    const arrived = progress(stopped, Math.max(0, returning.arrival - stopped.minute) + 1);
    expect(arrived.returns["a"]?.status).toBe("depot");
    expect(arrived.stock).toEqual(stopped.stock);
    const later = progress(arrived, 20);
    expect(later.returns["a"]?.train).toEqual(arrived.returns["a"]?.train);
  });
  it("deleting a substitution also cancels its return movement", () => {
    const stopped = progress(fixture(), 1);
    expect(stopped.returns["a"]).toBeDefined();
    expect(restore(stopped, "a").returns).toEqual({});
    expect(restore(stopped).returns).toEqual({});
  });
  it("does not send a train to a depot before its substitution happens", () => {
    expect(fixture().returns).toEqual({});
    const cancelled = { ...fixture(), stock: Object.fromEntries(DEPOTS.map(d => [d.id, 0])) };
    expect(progress(cancelled, 1).returns).toEqual({});
  });
  it("inspection after arrival: approval adds a reserve, hold keeps stock, returning trains are untouched", () => {
    const stopped = progress(fixture(), 1);
    const returning = stopped.returns["a"];
    if (!returning) throw new Error("Missing depot return");
    const depot = DEPOTS.find(d => d.id === returning.depot)!;
    const before = stopped.stock[depot.id] ?? 0;
    const arrived = progress(stopped, Math.max(0, returning.arrival - stopped.minute) + 1);
    expect(reviewReturn(arrived, "a", true).stock[depot.id]).toBe(Math.min(depot.capacity, before + 1));
    expect(reviewReturn(arrived, "a", true).returns["a"]).toBeUndefined();
    expect(reviewReturn(arrived, "a", false).stock[depot.id]).toBe(before);
    expect(reviewReturn(arrived, "a", false).returns["a"]).toBeUndefined();
    const moving = reviewReturn({ ...stopped, returns: { a: { ...returning, status: "returning", arrival: stopped.minute + 30 } } }, "a", true);
    expect(moving.returns["a"]?.status).toBe("returning");
    expect(moving.stock[depot.id]).toBe(before);
  });
});
import { removeTrains as _rm, restore as _rs } from "./timeline";
import { netPassengerMinutes as _net, PASSENGERS as _P } from "./depots";
import { syntheticTrains as _syn } from "./sim";
describe("direct removal balance", () => {
  it("waits until the next interval, returns with zero own delay, and only moves after departure", () => {
    const t = fixture().original[0];
    if (!t) throw new Error("Missing train");
    const stopped = _rm({ ...initialTimeline, minute: 361, original: [t] }, [t.id]);
    const queued = _rs(progress(stopped, 5), t.id);
    expect(queued.reentries[t.id]).toBe(420);
    expect(queued.overrides[t.id]?.baseDelay).toBe(0);
    expect(queued.overrides[t.id]?.frac).toBe(0);
    expect(scenarioDelays(queued).size).toBe(0);
    const waiting = progress(queued, 53);
    expect(waiting.minute).toBe(419);
    expect(scenarioTrains(waiting)[0]?.frac).toBe(0);
    expect(scenarioDelays(waiting).size).toBe(0);
    const departed = progress(waiting, 1);
    expect(departed.reentries).toEqual({});
    expect(departed.removed.size).toBe(0);
    expect(scenarioDelays(departed).get(t.id)).toBe(0);
    expect(scenarioTrains(departed)[0]?.frac).toBe(0);
    expect(scenarioTrains(progress(departed, 1))[0]?.frac).toBeGreaterThan(0);
    expect(_rs(queued, t.id).reentries[t.id]).toBe(420);
  });
  it.each([["suburban", 20, 380], ["regional", 60, 420], ["national", 120, 480]])("respects the %s category interval of %i minutes", (product, interval, at) => {
    const t = fixture().original[0];
    if (!t) throw new Error("Missing train");
    const queued = _rs(_rm({ ...initialTimeline, minute: 361, original: [{ ...t, product }] }, [t.id]));
    expect(queued.reentries[t.id]).toBe(at);
    expect((queued.reentries[t.id] ?? 0) % interval).toBe(0);
  });
  it("keeps reentry punctual across midnight and clears the removed train's breakdown", () => {
    const t = fixture().original[0];
    if (!t) throw new Error("Missing train");
    const queued = _rs(_rm(breakDown({ ...initialTimeline, minute: 1439, original: [t] }, t.id), [t.id]), t.id);
    const departed = progress(queued, 1);
    expect(departed.minute).toBe(1440);
    expect(scenarioDelays(departed).get(t.id)).toBe(0);
    expect(scenarioTrains(progress(departed, 1))[0]?.frac).toBeGreaterThan(0);
  });
  it("counts a removed train as a cancelled trip and undoes it on restore", () => {
    const original = _syn();
    const t = original[0]!;
    const s = _rm({ ...initialTimeline, original }, [t.id]);
    expect(s.dispatches).toHaveLength(1);
    expect(_net(s.dispatches[0]!)).toBe(-(_P[t.product] ?? 200) * 60);
    expect(_rs(s, t.id).dispatches).toHaveLength(0);
  });
});
