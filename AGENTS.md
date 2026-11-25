<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep simulation time, original network, scenario changes, station stops and daily snapshots in one atomic timeline state so both comparisons advance by the same elapsed time.
- Estimate arrival times from remaining network travel duration plus simulated delay; label them as estimates rather than official DB schedules.
- Capture the feed once per simulation session so refreshes cannot overwrite experimental stops, substitutions or daily history.
- Render pending passenger forecasts from the existing suggestion calculation in a shared presentation component; never dispatch or consume reserve stock just to display an estimate.
- Keep depot returns in the atomic timeline as separate empty movements using a one-way network route; include en-route movements in congestion but exclude them from passenger-service counts and never replenish reserve stock on their arrival.
- Queue restored passenger services in the atomic timeline until the next product headway slot, splitting progress at departure and resetting own delay there; this prevents early movement or counting waiting trains as active.
- Delay recovery and block spacing live in the timeline step: delayed trains on free track (no block ahead, no incident in lookahead) advance extra distance equal to the recovered minutes; followers are capped one block behind the leader on the same edge and direction. Why: keeps movement and delay consistent in one atomic state.
- Live train data is fetched server-side (createServerFn in src/lib/live.functions.ts) from a public HAFAS endpoint; parsing lives in src/lib/hafas.ts. Why: browser CORS and unstable community proxies.
- Live trains follow their real HAFAS stop sequence: the parser returns extra stations/segments and the client registers them into the network before the map mounts; schematic snapping is only a fallback. Why: keeps every real train on its true trajectory.
- Linear diagrams use a session-stable corridor layout (chained from the most-travelled shared segments, only extended when new segments appear, ordered by fixed capture-time weight); filters only hide trains, each train appears once on the corridor holding its current segment, in a sticky row. Why: matches operator views and prevents lines and trains from jumping each tick.
- Unit rotations (turnaround buffer, inherited delay, Recovery Reset) live in src/lib/rotation.ts and are applied inside the timeline step at terminal reversal, for both baseline and scenario. Why: both worlds must follow the same Folgeverspätung rule.
- Depot stock is keyed per fleet (`id` long-distance, `id:regio` regional); pickDepot takes the product. Why: reserves only replace their own category.

- Translate presentation labels without changing timeline status identifiers, train numbers or station names. Why: the English interface must preserve simulation behavior and captured data.
