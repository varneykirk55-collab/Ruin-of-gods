# Ruin of Gods

A browser god-sim destruction sandbox. You are the god: break a living valley with an earthquake, flood, meteor, divine finger, firestorm, lightning, or tornado. Everything you break stays broken, and the survivors carry on.

![Aftermath](docs/aftermath.png)

## Play
Open `index.html` in any WebGL2 browser. Keep the `assets/music` folder alongside it for the soundtrack. No server or dependencies are required.

The four music tracks play in sequence and repeat while you play. Music adjusts the soundtrack. Effects adjusts ambience, voices and sound effects. On phones, both sliders are in the menu. Leaving the game pauses its audio. Returning resumes the track from the same position, with your volume and mute settings preserved.

## Controls
| Input | Action |
|---|---|
| 1-8 | Observe, Earthquake, Flood, Meteor, Divine Finger, Firestorm, Lightning, Tornado |
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

The valley spans 160 columns and 320 rows. Pan south across the estuary to reach the farm village, forest settlement and volcano. In Observe, tap the glowing crater to start a seven-second warning. A nearby earthquake or the volcano’s own timer can also wake it. An eruption feeds lava for 26 simulation seconds. Hot material follows the lowest neighbouring surface, ignites vegetation, damages structures and cools into basalt. Water accelerates cooling.

The original 160 rows retain their indices and seeded generation sequence. Both halves share water, pathfinding, fire, building damage and hazard grids. Rendering culls terrain and vegetation in 32-cell tiles while offscreen hazards continue to advance. The portrait starting view is wider and the camera target can travel the entire length of the valley.

Version 3 saves include both regions, active lava, cooled basalt, storm schedules and loose debris. Versions 1 and 2 load the original valley in place, append the frontier and remap legacy shelter references. Browser storage still uses one save slot.
