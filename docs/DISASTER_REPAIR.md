# Ruin of Gods — disaster repair completion report

Branch: `astra/water-disaster-survival`
Base: `d4a14fce8d03ba3c545f8bbc9d167779e253b784`
Game implementation commit: `34043416fdea093e23cab3742438456834d8aa9a`
Final regression adjustment: `447b6a43e64d850f06784921f76d76afcb1c5a50`

No merge, deployment or publication was performed.

## Changes by phase

### 1. Flood
- Replaced the Flood input's terrain-carving call with finite-volume water emission. Clicking emits water immediately; holding adds water at a controlled rate; dragging moves the source.
- Reused the existing depth grid, flow solver, water renderer, building wetness and NPC hazards.
- Ordinary flow no longer discards shallow depths or erodes elevation. Water remains after release and repeated uses add volume.
- Springs, rainfall, crater seepage, the sea boundary reservoir and meteor vaporisation remain explicit source/sink mechanisms.
- Terrain deformation is retained for Earthquake, Meteor, Divine Finger and the existing terrain-deletion interaction. The internal terrain-channel helper remains available.

### 2. Divine Deletion
- Normal click/drag deletion removes the highlighted ray target without excavating land.
- Land deletion is separately selected by holding Alt at the start of a drag; the dam and map edge remain protected.
- Removed proximity fallback from the normal input path, clipped ray targets against terrain, added direct rubble ray targets, and refreshed terrain picking for each deletion sample.
- Object deletion can begin when the object ray hits but the terrain ray misses, including at map edges.
- Retained existing object removal, fades, collision cleanup, navigation-map cleanup, occupant evacuation and save/load persistence.

### 3. Cascading destruction
- Weakened but surviving supports progressively stress roofs, using the existing structural-damage implementation.
- Meteor outer shock damage now falls off with distance.
- Flooding suppresses building fire before further burning or ember propagation. Submerged building footprints resist ignition.
- Existing quake fractures, tornado wind damage/lift, debris limits, fire propagation, persistent craters and water movement remain operational.

### 4. NPC survival
- A cached hazard grid marks threats, tornadoes, incoming meteors and burning structures every 15 simulation ticks.
- NPCs detect persistent deep water at their own position and nearby rising floodwater. Stable nearby lakes do not cause panic.
- Pathfinding penalises danger; movement rechecks the next cell so newly flooded or burning paths stop immediately.
- Escape replanning has a cooldown and failed destinations are penalised. Movement accelerates and turns smoothly.
- Recovery depends on local safety, so distant panic does not prevent safe survivors returning to routines.
- Panic and tornado screams share a cooldown.
- Version 2 saves retain exact Float32 water depths, NPC survival timers/airborne state, and active earthquake/meteor/tornado hazards. Version 1 saves still load.

### 5. Regression
Discovered tool list: Observe, Earthquake, Flood, Meteor, Divine Finger, Firestorm, Lightning, Tornado, Divine Deletion.

- Generated bundle verified against `node build.js`.
- Existing simulation suite: **97 passed, 0 failed**.
- Focused water/deletion/survival/persistence/combined-disaster suite: **39 passed**.
- Chromium browser suite: **24 passed, 0 failed**.
- All changed JavaScript compiled.
- Combined checks include fire suppression by flooding, water in meteor craters, tornado damage and debris, deletion in altered settlements, persistence, legacy saves and repeated hazard cycles.
- A legacy assertion required some NPC to die randomly in an earlier sequence even if everyone escaped. It now explicitly traps an NPC in severe floodwater and verifies drowning. This preserves casualty verification without requiring failed escapes in every random playthrough.
- Browser checks wait for rendered camera state and simulation time, so slow software rendering does not produce premature input assertions.

CI evidence:
- [Browser regression](https://github.com/varneykirk55-collab/Ruin-of-gods/actions/runs/43981059252/job/133697321480): all 24 browser checks passed.
- [Implementation regression](https://github.com/varneykirk55-collab/Ruin-of-gods/actions/runs/43981059252): implementation including map-edge deletion; build, 97 simulation checks, 39 focused checks and 24 browser checks all passed.
- [Final regression revision](https://github.com/varneykirk55-collab/Ruin-of-gods/actions/runs/43981267962): deterministic trapped-NPC check; 97 simulation checks and 39 focused checks passed. Its browser rerun uses unchanged game code and browser tests from the already-passing implementation run.
- Screenshots, a playthrough video and `perf.json` are uploaded as `browser-disaster-evidence` workflow artifacts.

## Files modified
- `src/sim.js`
- `src/main.js`
- `src/template.html`
- `index.html` — regenerated playable bundle
- `tests/disaster_survival.js` — new focused regression
- `tests/test_sim.js` — deterministic severe-hazard casualty check
- `tests/browser_powers.js`
- `.github/workflows/disaster-regression.yml`
- `README.md`
- `docs/DISASTER_REPAIR.md`

## Remaining limitations and performance
- CI uses Chromium with SwiftShader and video capture, not a real GPU. The implementation run measured 2.0 FPS baseline and 1.7 FPS with stacked disasters (p95 717 ms); these absolute rates are unplayable. These software-rendering measurements do not establish playable performance on the target laptop. Real GPU performance remains unverified.
- Repeated four-second combined-disaster simulation rounds took 356, 250, 188 and 185 ms in the final Node job; timings are specific to the runner.
- Browser regression checks that stacked disasters retain at least 65% of the same environment's calm baseline. Repeated headless combined-disaster rounds stayed within existing limits of 3 tornadoes, 420 airborne debris objects and 2,400 rubble pieces, with finite nonnegative water.
- Actual sound quality and touch interaction have not been checked by ear or on a physical device. Terrain deletion currently requires a keyboard Alt modifier.
- Ordinary water erosion and implicit shallow-water loss are disabled. More shallow puddles may remain.
- Terrain heights retain existing 0.01-unit save quantisation; water depths are now lossless Float32. New water encoding adds roughly 68 KB per save.
- Active lightning storms and loose airborne debris are not restored; permanent damage and settled rubble are retained.
- Object dragging acts on pointer samples rather than interpolating through objects the pointer never targeted.
- The workspace shell was unavailable; changes were committed through GitHub and tested in the JavaScript runtime and GitHub Actions.

## Local testing
From an existing clone:

```sh
git fetch origin
git switch astra/water-disaster-survival
node build.js
node tests/test_sim.js 1234
node tests/disaster_survival.js
```

Open `index.html` in a WebGL2 browser; no server is needed.

Optional browser regression:

```sh
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
node tests/browser_powers.js
```

Set `CHROME_PATH` to an existing Chrome executable if desired; `SHOTS` overrides the default `artifacts/` directory.

Manual acceptance: hold Flood on a hillside, release, and watch a valley fill without terrain excavation. Flood a village, ignite nearby structures, send a tornado through, delete a highlighted survivor/object, then Save/Load and continue. Separately Alt-drag with Deletion to verify terrain removal. Check local frame rate and audio during the combined sequence.
