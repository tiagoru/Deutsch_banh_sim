import { describe, expect, it } from "vitest";
import { delayOf, hafasMin } from "./hafas";

describe("HAFAS feed parsing", () => {
  it("reads delay in minutes from scheduled vs realtime", () => {
    expect(delayOf([{ aTimeS: "162700", aTimeR: "165400" }])).toBe(27);
  });
  it("handles day-prefixed times past midnight", () => {
    expect(hafasMin("01000500")! - hafasMin("235500")!).toBe(10);
  });
  it("never reports negative delay for early trains", () => {
    expect(delayOf([{ dTimeS: "100000", dTimeR: "095800" }])).toBe(0);
  });
});

describe("real trajectory", () => {
  it("routes a train along its own stop sequence", async () => {
    const { parseGeoPos } = await import("./hafas");
    const loc = (name: string, x: number, y: number) => ({ name, crd: { x: x * 1e6, y: y * 1e6 } });
    const res = {
      common: { prodL: [{ nameS: "RE 1", prodCtx: { catOutS: "RE" }, cls: 8 }], locL: [loc("Aldorf", 9, 51), loc("Bedorf", 9.5, 51), loc("Cedorf", 10, 51)] },
      jnyL: [{ jid: "j1", prodX: 0, dirTxt: "Cedorf", pos: { x: 9.75e6, y: 51e6 }, stopL: [{ locX: 0 }, { locX: 1 }, { locX: 2 }] }],
    };
    const f = parseGeoPos(res);
    expect(f.trains[0]!.route.stations).toEqual(["Aldorf", "Bedorf", "Cedorf"]);
    expect(f.trains[0]!.edgeIdx).toBe(1);
    expect(f.edges).toHaveLength(2);
  });
});
