import { describe, expect, it } from "vitest";
import { syntheticTrains } from "./sim";
import { BLOCK_MIN, affectedTrains, breakDown, initialTimeline, progress, resolveIncident, scenarioDelays, scenarioTrains, slowSection, turnBack } from "./timeline";

const base = { ...initialTimeline, original: syntheticTrains() };
describe("incidents", () => {
  it("broken train stops and accumulates delay", () => {
    const t = base.original[0]!;
    const s = progress(breakDown(base, t.id), 30);
    const after = scenarioTrains(s).find(x => x.id === t.id)!;
    expect(after.frac).toBe(t.frac);
    expect(scenarioDelays(s).get(t.id)!).toBeGreaterThanOrEqual(30);
  });
  it("slow section adds 15 min to affected trains, cleared on resolve", () => {
    const t = base.original[0]!;
    const edge = t.route.edges[t.edgeIdx]!;
    const s = slowSection(base, edge);
    expect(affectedTrains(s).some(a => a.train.id === t.id)).toBe(true);
    expect(scenarioDelays(s).get(t.id)! - scenarioDelays(base).get(t.id)!).toBeCloseTo(15, 0);
    expect(scenarioDelays(resolveIncident(s)).get(t.id)).toBe(scenarioDelays(base).get(t.id));
  });
  it("block is 20 min", () => expect(BLOCK_MIN).toBe(20));
  it("turn back heads to origin", () => {
    const t = base.original[0]!;
    const back = scenarioTrains(turnBack(base, t.id)).find(x => x.id === t.id)!;
    expect(back.route.stations.at(-1)).toBe(t.route.stations[0]);
  });
});

describe("blocked track", () => {
  it("train behind a broken one on the same track stops", async () => {
    const { holdLimit } = await import("./timeline");
    const trains = base.original;
    const pair = trains.flatMap(a => trains.filter(b => b.id !== a.id && b.route.edges[b.edgeIdx] === a.route.edges[a.edgeIdx] && b.route.stations[b.edgeIdx] === a.route.stations[a.edgeIdx] && b.frac < a.frac).map(b => [a, b] as const))[0];
    if (!pair) return;
    const [ahead, behind] = pair;
    const s = progress(breakDown(base, ahead.id), 120);
    const after = scenarioTrains(s).find(x => x.id === behind.id)!;
    expect(after.edgeIdx).toBe(behind.edgeIdx);
    expect(after.frac).toBeLessThan(ahead.frac);
    expect(holdLimit(s, after)).not.toBeNull();
  });
});

import { describe as d2, it as i2, expect as e2 } from "vitest";
import * as TL from "./timeline";
d2("breakdown delay persists", () => {
  i2("keeps repair time as own delay after resolve", () => {
    const t: any = { id: "x", name: "X", product: "ice", baseDelay: 0, extra: 0, edgeIdx: 0, frac: 0.1, route: { stations: ["a", "b"], edges: ["e"] }, direction: "b" };
    const s: any = { ...TL.initialTimeline, original: [t], minute: 400, incidents: [{ id: "b-x", kind: "broken", edge: "e", trainId: "x", extra: 20, since: 320 }] };
    const r = TL.resolveIncident(s, "b-x");
    e2(r.overrides["x"]?.baseDelay).toBe(80);
    e2(TL.incidentsOf(r)).toHaveLength(0);
  });
});
