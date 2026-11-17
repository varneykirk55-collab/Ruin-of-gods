# Ruin of Gods

A browser god-sim destruction sandbox. You are the god: break a living valley with an earthquake, flood, meteor, divine finger, firestorm, lightning, or tornado. Everything you break stays broken, and the survivors carry on.

![Aftermath](docs/aftermath.png)

## Play
Open `index.html` in any WebGL2 browser. Keep the `assets/music` folder alongside it for the soundtrack. No server or dependencies are required.

The four music tracks play in sequence and repeat while you play. Music adjusts the soundtrack. Effects adjusts ambience, voices and sound effects. On phones, both sliders are in the menu. Leaving the game pauses its audio. Returning resumes the track from the same position, with your volume and mute settings preserved.

## Controls
| Input | Action |
|---|---|
| 1-9 | Observe, Earthquake, Flood, Meteor, Divine Finger, Firestorm, Lightning, Tornado, Lava |
| Left mouse | Use the power (Observe: drag to pan, click a villager to follow) |
| Right-drag | Rotate and tilt |
| Shift-drag / middle-drag | Pan while a power is selected |
| Wheel | Zoom |
| WASD / arrows, Q E, R F | Move, rotate, tilt |
| [ ] | Intensity |
| Space, M, H | Pause, mute, help |
| Touch | Move for one-finger panning, Rotate for one-finger orbit and tilt. Tap the active camera button again to use the selected power. Two fingers pan, pinch and twist |

Lightning darkens the sky, blasts one huge bolt down, then hurls a barrage of forks that seek the tallest buildings and trees; strikes on water electrocute anyone wading.

Tornado (8) drops a spinning funnel you steer with the mouse. It pulls villagers, trees, and debris in, lifts them, and throws them back out, and it tears buildings down harder the closer they are to the core. Your god hand points at the selected location and animates as you use each power.

Flood (3) emits additional water while clicked or held. Drag to move the source. Water spreads downhill, pools in valleys and craters, suppresses fire, and damages flooded buildings. Flow never excavates terrain. Earthquake, Meteor and Divine Finger retain their landscape effects; the terrain channel helper remains available internally. Save and Load keep terrain, water, scorch, fractures, rubble, building damage, villagers and tents (browser local storage).

## Layout
- `src/sim.js`: simulation core (no DOM): terrain, water, fire, structures, villagers, powers, save/load
- `src/render.js`: WebGL2 renderer and particles
- `src/audio.js`: procedural WebAudio and soundtrack playback
- `assets/music/`: compressed versions of the four supplied soundtrack WAVs
- `src/main.js`, `src/template.html`: input, HUD, game loop, page shell
- `build.js`: bundles `src/` into `index.html` (`node build.js`)
- `tests/test_sim.js`: headless simulation tests (`node tests/test_sim.js [seed]`)
- `tests/accept.js`: browser playthrough with real mouse and keyboard (needs `playwright` and Chrome with WebGL2)

## Known limitations
Frame rate is unmeasured on real GPUs, sound and touch have not been tested by ear or on a phone, saves are a single browser slot, and flood severity varies with the generated world.

## Development verification

Run `node build.js`, `node tests/test_sim.js 1234`, and `node tests/disaster_survival.js`. Browser checks: install Playwright with `npm install --no-save --package-lock=false playwright@1.56.1`, run `npx playwright install chromium`, then `node tests/browser_powers.js`. Set `CHROME_PATH` to use an existing Chrome executable; screenshots and video go to `artifacts/` by default.

## Southern frontier

The valley spans 160 columns and 320 rows. Pan south across the estuary to reach the farm village, forest settlement and volcano. In Observe, tap the glowing crater to start a seven-second warning. A nearby earthquake or the volcano’s own timer can also wake it. An eruption feeds a broad lava source for 90 simulation seconds. Hot material spreads across lower neighbouring surfaces, ignites vegetation, damages structures and cools into basalt. Water accelerates cooling.

The original 160 rows retain their indices and seeded generation sequence. Both halves share water, pathfinding, fire, building damage and hazard grids. Rendering culls terrain and vegetation in 32-cell tiles while offscreen hazards continue to advance. The portrait starting view is wider and the camera target can travel the entire length of the valley.

Version 3 saves include both regions, active lava, cooled basalt, storm schedules and loose debris. Versions 1 and 2 load the original valley in place, append the frontier and remap legacy shelter references. Browser storage still uses one save slot.

## Arctic frontier

Continue past the outer estuary beyond the volcano region to reach the Arctic. The continuous grid is now 160 × 480 cells, with the previous 320 rows and their coordinates preserved. A winding transition leads through cooler hills, patchy snow and pine forest into snow plains, a frozen lake, a partly open river, mountain passes and turquoise glacial ridges. Two cabin villages reuse the existing population, pathfinding and damage systems.

Snow cover grows slowly and more quickly under localized blizzards. Melting a full cover adds 0.16 units of water. Ice is stored as a frozen portion of existing water volume. Freezing and melting ice preserve total water. Transport uses the remaining liquid, rapid channels stay open, heat delays refreezing, and destructive forces expose liquid through fractured ice. NPCs avoid flooded and dangerous lake cells using existing navigation. Fire, lava, meteor impacts, earthquakes and the divine finger affect frozen surfaces. Tornadoes lift local snow visually. Blizzards occur automatically, reduce world visibility within a 27-cell radius and use the existing wind audio and capped particles.

Version 4 saves preserve snow, ice, thaw timers and blizzard progression alongside the existing world and disasters. Versions 1–3 append the new terrain while retaining their saved terrain and settlements, with shelter references shifted past new permanent buildings. Rendering uses the existing tile culling. Cold processing runs in four alternating bands independently of the camera. Glacial formations are terrain geometry. Individual ice fragments and structural glacier flow are outside this approximation.

For Arctic regression, extract `src/sim.js` from commit `f5751a1` and set `ARCTIC_BASE_SIM` to that file when running `node tests/arctic.js`. `ARCTIC_BASE_HTML` selects the same commit’s bundled HTML for `node tests/arctic_browser.js`. These checks run on feature-branch pushes, with screenshots and benchmark results uploaded by GitHub Actions. Device performance still requires physical iPhone and Android testing.

Lava (9) pours molten material at the cursor. Hold to feed a flow or drag to paint a wider source. Intensity controls the source width and output. Lava uses the volcano simulation, melts Arctic ice and snow, damages settlements, and leaves persistent basalt. Water cools it faster than dry terrain.
