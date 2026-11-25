import { describe, expect, it } from "vitest";
import { assignServices, assignStickyRows, diagramCorridors, diagramPositions, diagramRoutes, diagramRows, extendCorridors } from "./line-diagram";
import type { Train } from "./sim";

const train = (id: string, stations = ["A", "B"], edges = ["real-edge"], frac = 0.5): Train => ({ id, name: id, product: "regional", direction: stations.at(-1) ?? "", route: { stations, edges }, edgeIdx: 0, frac, baseDelay: 0 });

describe("linear route presentation", () => {
  it("keeps individual service rows stable as trains move past each other", () => {
    const route = { stations: ["A", "B"], edges: ["real-edge"] };
    const first = diagramRows(route, [train("one", undefined, undefined, .1), train("two", undefined, undefined, .9)]);
    const moved = diagramRows(route, [train("two", undefined, undefined, .1), train("one", undefined, undefined, .9)]);
    expect(first.map(p => [p.train.id, p.row])).toEqual([["one", 0], ["two", 1]]);
    expect(moved.map(p => [p.train.id, p.row])).toEqual([["one", 0], ["two", 1]]);
    expect(first[0]?.x).not.toBe(moved[0]?.x);
  });
  it("includes live itineraries outside preset corridors and groups both directions", () => {
    const routes = diagramRoutes([train("out"), train("back", ["B", "A"]), train("other", ["A", "C"], ["other-edge"])]);
    expect(routes).toHaveLength(2);
    expect(routes[0]?.services.map(t => t.id)).toEqual(["out", "back"]);
  });
  it("does not merge distinct tracks with identical station names", () => {
    expect(diagramRoutes([train("one"), train("two", ["A", "B"], ["parallel-edge"])])).toHaveLength(2);
  });
  it("places reverse traffic accurately and excludes nonshared tracks", () => {
    const positions = diagramPositions({ stations: ["A", "B"], edges: ["real-edge"] }, [train("back", ["B", "A"], ["real-edge"], 0.25), train("elsewhere", ["A", "B"], ["parallel-edge"])]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.x).toBe(225);
    expect(positions[0]?.forward).toBe(false);
  });
  it("separates coincident trains into distinct label lanes without hiding any", () => {
    const trains = Array.from({ length: 40 }, (_, i) => train(`train-${i}`));
    const positions = diagramPositions({ stations: ["A", "B"], edges: ["real-edge"] }, trains);
    expect(positions).toHaveLength(40);
    expect(new Set(positions.map(p => p.lane)).size).toBe(40);
  });
  it("merges different itineraries sharing track into one corridor and shows every train once", () => {
    const trains = [train("ice", ["A", "B", "C"], ["ab", "bc"]), train("re", ["B", "C", "D"], ["bc", "cd"]), train("s", ["C", "B"], ["bc"])];
    trains[1]!.edgeIdx = 0;
    const corridors = diagramCorridors(trains);
    expect(corridors.flatMap(c => c.services.map(t => t.id)).sort()).toEqual(["ice", "re", "s"]);
    expect(corridors).toHaveLength(1);
    expect(corridors[0]?.stations).toEqual(["A", "B", "C", "D"]);
  });
});

describe("stable corridor layout", () => {
  const net = () => [train("ice", ["A", "B", "C"], ["ab", "bc"]), train("re", ["B", "C", "D"], ["bc", "cd"]), train("s", ["X", "Y"], ["xy"]), train("s2", ["X", "Y"], ["xy"])];
  it("keeps corridor ids and order while trains move between segments", () => {
    const trains = net();
    const layout = extendCorridors(undefined, trains);
    const before = assignServices(layout, trains).map(c => c.id);
    trains[0]!.edgeIdx = 1; trains[1]!.edgeIdx = 1; trains[2]!.frac = .9;
    const again = extendCorridors(layout, trains);
    expect(again).toEqual(layout);
    expect(assignServices(again, trains).map(c => c.id)).toEqual(before);
  });
  it("filters only hide trains and never reshape corridors", () => {
    const trains = net();
    const layout = extendCorridors(undefined, trains);
    const filtered = assignServices(layout, trains.filter(t => t.id === "s"));
    expect(filtered.map(c => c.id)).toEqual(layout.map(c => c.id));
    expect(filtered.flatMap(c => c.services.map(t => t.id))).toEqual(["s"]);
  });
  it("appends corridors for new segments without touching existing ones", () => {
    const trains = net();
    const layout = extendCorridors(undefined, trains);
    const next = extendCorridors(layout, [...trains, train("detour", ["A", "Z"], ["az"])]);
    expect(next.slice(0, layout.length)).toEqual(layout);
    expect(next.at(-1)?.edges).toEqual(["az"]);
  });
  it("keeps each train's row when it reverses or others join and leave", () => {
    const route = { stations: ["A", "B"], edges: ["real-edge"] };
    const rows1 = assignStickyRows(diagramPositions(route, [train("a"), train("b"), train("c")]), new Map());
    const back = train("a", ["B", "A"]);
    const rows2 = assignStickyRows(diagramPositions(route, [back, train("c"), train("d")]), rows1);
    expect(rows2.get("a")).toBe(rows1.get("a"));
    expect(rows2.get("c")).toBe(rows1.get("c"));
    expect(rows2.get("d")).toBe(rows1.get("b"));
  });
});
