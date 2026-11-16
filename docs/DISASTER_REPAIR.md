# Ruin of Gods implementation and verification

Branch: astra/water-disaster-survival
Base: d4a14fce8d03ba3c545f8bbc9d167779e253b784

## Phase 1
Flood now emits finite water volume at the selected location and during drags. It no longer calls the terrain carving helper. Ordinary water flow no longer clips shallow depths or erodes terrain; springs, rainfall, crater seepage, the sea reservoir and meteor vaporisation remain explicit source/sink mechanisms. The existing depth grid, hydraulic flow and renderer are reused.

Controlled basin checks passed: downhill flow, valley accumulation, volume conservation, nonnegative depth, unchanged terrain, persistent water and repeated emission.

## Phase 2
Normal deletion uses the highlighted ray target, without land deletion or proximity fallback. Terrain deletion is an explicit Alt-started drag. Terrain occludes target selection. Rubble receives ray targeting. Existing building/tree/NPC/prop removal and fades are preserved. Collision, adjacent-object integrity and deletion persistence checks passed.

## Phase 3
Surviving but weakened supports now continue to stress roofs. Meteor outer shock damage decreases with distance. Flood suppresses structure fire before burn damage/spread; submerged building footprints resist ignition. Existing quake, tornado, debris, fire, flood and crater systems are retained. Targeted interaction checks passed.

## Phase 4
A hazard grid is refreshed every 15 simulation ticks for threat, storm and burning-structure avoidance. NPCs detect persistent deep water, validate the next path cell during movement, throttle escape replanning, penalise failed destinations, accelerate and turn smoothly, and recover according to local safety. Panic audio shares a cooldown. Version 2 saves retain full water depths, survival timers, airborne state and active earthquake/meteor/tornado hazards; version 1 loading remains supported.

Targeted routing, hazard proximity, survival/recovery, audio cooldown and save/load checks passed.

## Phase 5
Power list discovered in src/main.js: Observe, Earthquake, Flood, Meteor, Divine Finger, Firestorm, Lightning, Tornado, Divine Deletion.

All changed scripts compiled using the available JavaScript runtime. The existing simulation regression and new combined tests are in progress. Browser regression updated for the repaired Flood/object-deletion behavior. A dedicated GitHub Actions workflow runs Node simulation tests, verifies the generated bundle, and runs Chromium input/power/persistence tests with screenshots/video.

## Limitations and performance
The workspace shell is unavailable. Runtime test execution is possible in the tool JavaScript engine, but local browser/audio/GPU verification is unavailable here. CI results are reported separately when available. Hazard-grid work is bounded to 25,600 cells plus local hazard footprints four times per simulation second. Existing three-tornado, 420-debris and 2,400-rubble limits are retained. New water saves add roughly 68 KB versus the previous quantised depth encoding. Sustained browser/GPU performance and sound quality need actual browser evidence.

Ordinary flow has no implicit evaporation: more shallow puddles can remain. Terrain water erosion is disabled so Flood never excavates. Active lightning storms and loose airborne debris are not restored; NPC injuries, permanent damage and settled rubble are. Terrain heights retain existing 0.01-unit save quantisation. Native touch has no Alt key, so terrain deletion is currently keyboard-only. The object drag uses pointer samples rather than interpolating through unseen objects. No deployment or merge is performed.

## Local use
1. Fetch and check out astra/water-disaster-survival.
2. Run node build.js.
3. Open index.html in a WebGL2 browser.
4. Run node tests/test_sim.js 1234 and node tests/disaster_survival.js.
5. Optional browser suite: npm install --no-save --package-lock=false playwright@1.56.1; npx playwright install chromium; node tests/browser_powers.js.

Manual acceptance: hold Flood on a hillside, release and watch the valley fill; check that terrain is unchanged. Ignite a village, flood it, send a tornado through, delete an individual survivor/object, Save/Load and continue. Alt-drag with Deletion separately verifies terrain deletion. Review artifacts from the browser workflow for input and frame-time evidence.
