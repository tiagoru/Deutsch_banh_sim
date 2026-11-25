import { describe, expect, it } from "vitest";
import { initialStock, netPassengerMinutes, recentDispatches, suggestOptions, type Dispatch } from "./depots";

describe("recent dispatch history", () => {
  it("selects only the last six, newest first, without changing the full passenger balance", () => {
    const rows: Dispatch[] = Array.from({ length: 9 }, (_, i) => ({ trainId: String(i), name: String(i), station: "Hamburg", depot: null, kind: "cancel", wait: 0, delayAvoided: 0, passengers: 100 }));
    expect(recentDispatches(rows).map(d => d.trainId)).toEqual(["8", "7", "6", "5", "4", "3"]);
    expect(rows).toHaveLength(9);
    expect(rows.reduce((sum, d) => sum + netPassengerMinutes(d), 0)).toBe(-54000);
  });
});

describe("suggestOptions", () => {
  it("keeps an on-time train", () => {
    expect(suggestOptions("Hannover", "regional", 0, initialStock()).best).toBe("keep");
  });
  it("suggests the reserve for a very late train next to a depot", () => {
    expect(suggestOptions("Hannover", "nationalExpress", 50, initialStock()).best).toBe("reserve");
  });
  it("previews reserve passenger savings before dispatch without consuming stock", () => {
    const stock = initialStock();
    const reserve = suggestOptions("Hannover", "nationalExpress", 50, stock).options.find(o => o.kind === "reserve");
    expect(reserve?.wait).toBe(12);
    expect(reserve?.net).toBe(450 * (50 - 12));
    expect(stock["han"]).toBe(1);
  });
  it("previews additional passenger time for a slower regular connection", () => {
    const transfer = suggestOptions("Hannover", "nationalExpress", 50, initialStock()).options.find(o => o.kind === "transfer");
    expect(transfer?.net).toBe(450 * (50 - 60));
  });
  it("suggests the next regular S-Bahn when depots are empty", () => {
    const empty = Object.fromEntries(Object.keys(initialStock()).map(k => [k, 0]));
    const r = suggestOptions("Hannover", "suburban", 40, empty);
    expect(r.best).toBe("transfer");
    expect(r.options.find(o => o.kind === "reserve")?.available).toBe(false);
  });
});
