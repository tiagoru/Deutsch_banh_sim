import { describe, expect, it } from "vitest";
import { syntheticTrains } from "./sim";
import { initialTimeline, opsOf, progress, recoveryReset, remainingMinutes, scenarioTrains } from "./timeline";
import { inheritedDelay, nextServiceName, TURNAROUND } from "./rotation";
import { initialStock, pickDepot, stockKey } from "./depots";

const atEnd = (product: string, baseDelay: number) => {
  const base = syntheticTrains()[0]!;
  const t = { ...base, product, baseDelay, edgeIdx: base.route.edges.length - 1, frac: 0.99 };
  return { ...initialTimeline, original: [t] };
};

describe("rotations", () => {
  it("ICE turnaround is 30 min, S-Bahn 10 min", () => { expect(TURNAROUND["nationalExpress"]).toBe(30); expect(TURNAROUND["suburban"]).toBe(10); });
  it("delay beyond the buffer is inherited", () => { expect(inheritedDelay(50, "nationalExpress")).toBe(20); expect(inheritedDelay(20, "nationalExpress")).toBe(0); });
  it("next service number flips parity", () => { expect(nextServiceName("ICE 521")).toBe("ICE 522"); expect(nextServiceName("ICE 522")).toBe("ICE 521"); });
  it("without reset a 50-min late ICE starts its next service 20 min late", () => {
    const s = atEnd("nationalExpress", 50);
    const out = progress(s, remainingMinutes(s.original[0]!) + 1);
    expect(scenarioTrains(out)[0]!.baseDelay).toBeCloseTo(20, 0);
    expect(opsOf(out).inherited).toBeGreaterThan(19);
  });
  it("Recovery Reset swaps the unit at the terminal: next service on time, one long-distance reserve used", () => {
    const s = recoveryReset(atEnd("nationalExpress", 50), syntheticTrains()[0]!.id);
    const out = progress(s, remainingMinutes(s.original[0]!) + 1);
    expect(scenarioTrains(out)[0]!.baseDelay).toBe(0);
    const used = Object.keys(initialStock()).filter(k => out.stock[k] !== initialStock()[k]);
    expect(used.length).toBe(1);
    expect(used[0]!.endsWith(":regio")).toBe(false);
    expect(opsOf(out).avoided).toBeGreaterThan(19);
  });
  it("regional reserves never replace long-distance services", () => {
    const stock = Object.fromEntries(Object.keys(initialStock()).map(k => [k, k.endsWith(":regio") ? 1 : 0]));
    expect(pickDepot("Hamburg", stock, "nationalExpress")).toBeNull();
    expect(pickDepot("Hamburg", stock, "regional")?.key).toBe(stockKey("ham", "regional"));
  });
});
