import { describe, expect, it } from "vitest";
import { syntheticTrains } from "./sim";
import { BLOCK_KM, RECOVERY_RATE, blockLimit, initialTimeline, progress, recoveredOf, scenarioTrains } from "./timeline";

const one = (overrides: object) => {
  const t = { ...syntheticTrains()[0]!, ...overrides };
  return { ...initialTimeline, original: [t] };
};

describe("delay recovery on free track", () => {
  it("recovers 8% of elapsed time", () => expect(RECOVERY_RATE).toBe(0.08));
  it("a lone delayed train wins back 0.8 min in 10 min", () => {
    const s = progress(one({ baseDelay: 20 }), 10);
    expect(scenarioTrains(s)[0]!.baseDelay).toBeCloseTo(19.2, 5);
    expect(Object.values(recoveredOf(s))[0]).toBeCloseTo(0.8, 5);
  });
  it("never recovers below zero", () => {
    const s = progress(one({ baseDelay: 0.5 }), 10);
    expect(scenarioTrains(s)[0]!.baseDelay).toBe(0);
  });
});

describe("block spacing", () => {
  it("block lengths per line type", () => expect(BLOCK_KM).toEqual({ hs: 5, main: 2, secondary: 1.5, industrial: 1 }));
  it("a train right behind another in the same direction is held", () => {
    const a = syntheticTrains()[0]!;
    const lead = { ...a, frac: 0.5 };
    const follower = { ...a, id: "follower", frac: 0.49 };
    const s = { ...initialTimeline, original: [lead, follower] };
    expect(blockLimit(s, follower)).not.toBeNull();
    expect(blockLimit(s, lead)).toBeNull();
  });
});
