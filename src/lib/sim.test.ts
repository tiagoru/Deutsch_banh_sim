import { describe, it, expect } from "vitest";
import { simulate, statusOf, reroute, destination, delayedOver, type Train } from "./sim";
import { alternatives, shortestRoute } from "./network";

const mk = (id: string, from: string, to: string, baseDelay: number): Train => ({
  id, name: id, product: "regional", direction: to, route: shortestRoute(from, to)!, edgeIdx: 0, frac: 0.5, baseDelay,
});

describe("status colors", () => {
  it("green on time, yellow up to 10 min, red above", () => {
    expect(statusOf(0)).toBe("green");
    expect(statusOf(10)).toBe("yellow");
    expect(statusOf(11)).toBe("red");
  });
});

describe("removing a delayed train", () => {
  it("restores an on-time train sharing the same track", () => {
    const trains = [mk("a", "Köln", "Mainz", 0), mk("b", "Köln", "Mainz", 30)];
    expect(simulate(trains, new Set()).get("a")!).toBeGreaterThan(0);
    expect(simulate(trains, new Set(["b"])).get("a")).toBe(0);
  });
});

describe("rerouting", () => {
  it("keeps the destination", () => {
    const t = mk("a", "Hamburg", "München", 0);
    const from = t.route.stations[1]!;
    const alt = alternatives(from, destination(t), t.route.edges.slice(1))[0]!;
    expect(destination(reroute(t, alt))).toBe("München");
  });
});

describe("delayedOver", () => {
  it("selects only trains whose own delay is above the limit", () => {
    const trains = [mk("a", "Köln", "Mainz", 0), mk("b", "Köln", "Mainz", 30), mk("c", "Köln", "Mainz", 31)];
    expect(trains.filter(delayedOver(30)).map((t) => t.id)).toEqual(["c"]);
  });
});

import { delayForDay, replacementFor, syntheticTrains as st2 } from "./sim";
describe("ciclo diário e substituição", () => {
  it("atraso por dia é determinístico e varia entre dias", () => {
    expect(delayForDay("x", 3)).toBe(delayForDay("x", 3));
    const ids = Array.from({ length: 200 }, (_, i) => `t${i}`);
    const sum = (d: number) => ids.reduce((a, id) => a + delayForDay(id, d), 0);
    expect(sum(4)).toBeGreaterThan(sum(6)); // sexta pior que domingo
  });
  it("substituto parte da próxima estação sem atraso", () => {
    const t = { ...st2(1)[0]!, edgeIdx: 0, baseDelay: 25 };
    const r = replacementFor(t, 1)!;
    expect(r.baseDelay).toBe(0);
    expect(r.route.stations[r.edgeIdx]).toBe(t.route.stations[1]);
  });
});

describe("substitute numbering", () => {
  it("substitute gets the original number with S", () => {
    const t = { ...mk("ice-521", "Hamburg", "München", 0), name: "ICE 521" };
    expect(replacementFor(t, 0)!.name).toBe("ICE 521S");
  });
});
