import { createServerFn } from "@tanstack/react-start";
import { parseGeoPos } from "./hafas";
import type { Train } from "./sim";
import type { Edge, Station } from "./network";

// Public HAFAS endpoint (ÖBB) which also covers trains running in Germany.
const BODY = {
  lang: "de", ver: "1.41", ext: "OEBB.1",
  client: { id: "OEBB", v: "6030600", type: "IPH", name: "oebbPROD-ADHOC" },
  auth: { type: "AID", aid: "OWDL4fE4ixNiPBBm" },
  svcReqL: [{ meth: "JourneyGeoPos", req: {
    maxJny: 1500, onlyRT: true, perSize: 30000, perStep: 5000,
    rect: { llCrd: { x: 5800000, y: 47200000 }, urCrd: { x: 15100000, y: 55100000 } },
    jnyFltrL: [{ type: "PROD", mode: "INC", value: "63" }], // trains only, no buses
  } }],
};

export const getLiveTrains = createServerFn({ method: "GET" }).handler(async (): Promise<{ trains: Train[]; stations: Station[]; edges: Edge[]; error: string | null }> => {
  try {
    const res = await fetch("https://fahrplan.oebb.at/bin/mgate.exe", {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify(BODY), signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const { trains, stations, edges } = parseGeoPos(json?.svcResL?.[0]?.res);
    if (!trains.length) throw new Error("vazio");
    return { trains, stations, edges, error: null };
  } catch (e) {
    console.error("HAFAS live feed failed", e);
    return { trains: [], stations: [], edges: [], error: "Feed da DB indisponível" };
  }
});
