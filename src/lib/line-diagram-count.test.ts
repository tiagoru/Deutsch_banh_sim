import { describe, it, expect } from "vitest";
import { diagramCorridors } from "./line-diagram";
const t = (id: string, stations: string[], edgeIdx = 0) => ({ id, route: { stations, edges: stations.slice(1).map((s, i) => `${stations[i]}-${s}`) }, edgeIdx }) as never;
describe("diagram count", () => {
  it("every train with a route appears exactly once", () => {
    const trains = [t("a", ["A","B","C"]), t("b", ["B","C","D"], 1), t("c", ["X","Y"]), t("d", ["A","B"])];
    const ids = diagramCorridors(trains).flatMap(c => c.services.map(s => (s as {id:string}).id)).sort();
    expect(ids).toEqual(["a","b","c","d"]);
  });
});
