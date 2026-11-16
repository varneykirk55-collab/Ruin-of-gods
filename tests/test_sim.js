const { World, N, NN, K, DEAD, PANIC, STUMBLE } = require('../src/sim.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const run = (w, s) => { for (let i = 0; i < s * 60; i++) w.tick(1 / 60); };
const sumW = w => { let s = 0; for (let i = 0; i < NN; i++) if (!(w.flag[i] & 2)) s += w.w[i]; return s; };
const seed = +(process.argv[2] || 1234);
let t0 = Date.now(); let w = new World(seed); console.log('gen ms', Date.now() - t0);
const logs = []; w.fx.log = m => logs.push(m); w.rainT = 1e9;
const vc = w.vc;
console.log('village', vc, 'buildings', w.buildings.length, 'npcs', w.npcs.length, 'trees', w.tree.reduce((a, b) => a + (b ? 1 : 0), 0), 'farm', w.farmCells.length, 'forestEdge', w.forestEdge.length, 'bank', w.bankCells.length);
// river profile
let prof = ''; for (let z = 25; z < 155; z += 10) { const x = Math.round(w.rx(z)); prof += ` z${z}:${w.w[z * N + x].toFixed(2)}`; } console.log('river depth', prof);
console.log('village ground-bed', (w.h[vc.z * N + vc.x] - w.bed(vc.z)).toFixed(2));

console.log('1/2 living world');
ok(w.buildings.length >= 20 && w.npcs.length >= 50, 'village and villagers exist');
t0 = Date.now(); run(w, 60); console.log('   60s sim ms', Date.now() - t0);
let moved = w.npcs.filter(n => Math.hypot(n.x - w.buildings[n.home].doorX, n.z - w.buildings[n.home].doorZ) > 3).length;
ok(moved > w.npcs.length * 0.6, 'villagers travel to work (' + moved + '/' + w.npcs.length + ' away from home)');
ok(w.npcs.filter(n => n.working).length > 5, 'villagers working: ' + w.npcs.filter(n => n.working).length);
ok(w.stats().dead === 0 && w.stats().pan === 0, 'no deaths or panic in a calm world'); ok(Math.max(...w.buildings.map(b => b.wet || 0)) < 0.15 && w.buildings.every(b => !b.parts.some(p => p.st)), 'no building floods or decays in a calm world');
const wv0 = sumW(w); run(w, 30); ok(Math.abs(sumW(w) - wv0) / wv0 < 0.05, 'river in steady state (' + wv0.toFixed(0) + ' -> ' + sumW(w).toFixed(0) + ')');
w.time = 0.9; run(w, 70); ok(w.npcs.filter(n => n.inside).length > w.npcs.length * 0.7, 'villagers go home at night: ' + w.npcs.filter(n => n.inside).length);
w.time = 0.35; run(w, 40);

console.log('5 water follows terrain');
{ const x = vc.x + 30, z = vc.z + 14, i = z * N + x; w.w[i] += 300; const y0 = w.h[i]; run(w, 20); let cx = 0, cz = 0, s = 0, hy = 0; for (let dz = -25; dz <= 25; dz++) for (let dx = -25; dx <= 25; dx++) { const j = (z + dz) * N + x + dx; const e = w.w[j] - w.wb[j]; if (e > 0.01) { s += e; hy += e * w.h[j]; } } ok(s > 1 && hy / s < y0, 'poured water ran downhill (mean ground ' + (hy / s).toFixed(2) + ' < source ' + y0.toFixed(2) + ')'); }

console.log('firestorm');
{ const st = w.stats(); let best = 0, f = 0; for (let z = 10; z < N - 10; z++) for (let x = 10; x < N - 10; x++) { let c = 0; for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) if (w.kind[(z + dz) * N + x + dx] === K.FOREST) c++; if (c > best) { best = c; f = z * N + x; } } const fx = f % N, fz = (f / N) | 0; const n = w.ignite(fx, fz, 0.6); ok(n > 0, 'ignite lit ' + n + ' cells'); run(w, 40); const sc = w.scorch.reduce((a, b) => a + (b > 200 ? 1 : 0), 0); ok(sc > 30, 'fire spread and left scorched ground: ' + sc + ' cells, still burning ' + w.fires.length); ok(w.tree.reduce((a, b) => a + (b === 3 ? 1 : 0), 0) > 3, 'burnt trees remain'); }
{ const b = w.buildings.find(b => b.type === 'house'); w.ignite(b.x, b.z, 0.3); let seen = new Set(), t1 = -1, t2 = -1; for (let s = 0; s < 480; s++) { run(w, 0.25); const c = b.parts.filter(p => p.st).length; seen.add(c); if (c > 0 && t1 < 0) t1 = s / 4; if (!b.ruin) t2 = s / 4; } ok(seen.size >= 4 && t2 - t1 > 5, 'burning house collapsed progressively over ' + (t2 - t1).toFixed(1) + 's (stages: ' + [...seen].join(',') + ')'); ok(b.ruin || b.parts.some(p => p.char > 0.5), 'house charred / ruined: ruin=' + b.ruin); }

console.log('earthquake');
{ const b0 = w.stats().bs; const hBefore = Float32Array.from(w.h); const pan0 = w.stats().pan; w.quake(vc.x - 12, vc.z - 20, vc.x + 14, vc.z + 22, 0.9); run(w, 1.5); const pn = w.stats().pan; ok(pn > 10, 'villagers stumble/panic: ' + pn); const stages = new Set(); for (let s = 0; s < 14; s++) { run(w, 1); stages.add(w.stats().bs); } let ch = 0, mx = 0; for (let i = 0; i < NN; i++) { const d = Math.abs(w.h[i] - hBefore[i]); if (d > 0.3) ch++; if (d > mx) mx = d; } ok(ch > 200, 'terrain fractured/shifted: ' + ch + ' cells, max ' + mx.toFixed(2)); ok(w.crack.some(v => v > 100), 'permanent fracture recorded'); ok(w.stats().bs < b0, 'buildings collapsed: ' + b0 + ' -> ' + w.stats().bs + ' (stages ' + [...stages].join(',') + ')'); ok(w.rubble.length > 20, 'rubble accumulated: ' + w.rubble.length); }

console.log('finger');
{ const b = w.buildings.find(b => !b.ruin && b.type === 'house'); if (b) { const h0 = w.hAt(b.x, b.z); w.fingerPress(b.x, b.z, 0.8); run(w, 1); ok(b.parts.filter(p => p.st).length >= 6, 'building flattened: ' + b.parts.filter(p => p.st).length + ' parts'); ok(w.hAt(b.x, b.z) < h0 - 0.5, 'terrain dented'); } else ok(false, 'no house left for finger'); }

console.log('meteor');
{ const x = vc.x + 22, z = vc.z + 2, h0 = w.hAt(x, z); const near = w.npcs.filter(n => n.st !== DEAD && Math.hypot(n.x - x, n.z - z) < 30).length; w.meteor(x, z, 0.7); run(w, 1); run(w, 3); ok(w.hAt(x, z) < h0 - 3, 'crater dug: ' + h0.toFixed(1) + ' -> ' + w.hAt(x, z).toFixed(1)); ok(w.craterCells.length > 50, 'crater cells ' + w.craterCells.length); ok(w.fires.length > 0, 'fires started: ' + w.fires.length); run(w, 200); const i = w.ci(x, z); ok(w.w[i] > 0.5, 'crater filling with water: depth ' + w.w[i].toFixed(2)); }

console.log('flood: dam break');
var wOld; { wOld = w; w = new World(seed); w.rainT = 1e9; w.fx.log = m => logs.push(m); run(w, 50); const dz = 58, dx = Math.round(w.rx(57)); const res0 = w.w[50 * N + Math.round(w.rx(50))]; const vi = vc.z * N + Math.round(w.rx(vc.z) + 7); const v0 = w.w[vi]; ok(w.nearDam(dx, dz, 2), 'dam located'); w.carve(dx, dz, 0.8, 0.1); ok(w.damBroken, 'dam breached'); let mxv = 0, mxb = 0; for (let s = 0; s < 80; s++) { run(w, 1); let fa = 0; for (let i = 60 * N; i < NN; i++) if (w.w[i] - w.wb[i] > 0.2 && w.h0[i] > w.bed((i / N) | 0) + 1.1) fa++; mxv = Math.max(mxv, fa); for (const b of w.buildings) mxb = Math.max(mxb, b.wet || 0); } const res1 = w.w[50 * N + Math.round(w.rx(50))]; ok(res1 < res0 * 0.5, 'reservoir drained: ' + res0.toFixed(2) + ' -> ' + res1.toFixed(2)); ok(mxv > 300, 'flood spilled over the banks: ' + mxv + ' land cells under water'); ok(mxb > 0.3, 'buildings flooded, max depth ' + mxb.toFixed(2)); ok(w.mud.some(v => v > 100), 'silt left behind'); ok(w.stats().pan > 5 || w.stats().hl > 0, 'villagers fled the flood: ' + JSON.stringify(w.stats())); run(w, 60); ok(w.buildings.some(b => b.ruin), 'flood destroyed buildings: ' + w.buildings.filter(b => b.ruin).length); }
{ // redirect river: carve a channel
  const z = 80, x0 = Math.round(w.rx(z)); const tx = x0 + 14; const before = w.w[z * N + tx]; for (let x = x0; x <= tx; x++) for (let k = 0; k < 6; k++) w.carve(x, z, 0.7, 0.1); run(w, 30); ok(w.w[z * N + tx - 2] > before + 0.1, 'carved channel filled from river: ' + w.w[z * N + tx - 2].toFixed(2)); }

console.log('survivors');
run(w, 120);
{ const s = w.stats(); console.log('   stats', JSON.stringify(s)); ok(s.alive > 0, 'survivors exist: ' + s.alive); ok(wOld.stats().dead > 0, 'earlier disasters killed villagers: ' + wOld.stats().dead); ok(s.pan < s.alive * 0.5, 'panic subsides: ' + s.pan); ok(s.tents > 0 || s.hl === 0, 'homeless camp/tents: tents ' + s.tents + ' homeless ' + s.hl); }

console.log('save/load');
{ const js = JSON.stringify(w.serialize()); console.log('   save size KB', (js.length / 1024) | 0); const w2 = World.load(JSON.parse(js)); let md = 0; for (let i = 0; i < NN; i++) md = Math.max(md, Math.abs(w.h[i] - w2.h[i])); ok(md < 0.011, 'terrain restored (max diff ' + md.toFixed(4) + ')'); ok(w2.stats().bs === w.stats().bs && w2.stats().dead === w.stats().dead, 'buildings/deaths restored'); ok(w2.rubble.length === w.rubble.length && w2.craterCells.length === w.craterCells.length, 'rubble and craters restored'); ok(w2.buildings.length === w.buildings.length, 'tents restored'); let sc = 0; for (let i = 0; i < NN; i++) if (w.scorch[i] !== w2.scorch[i] || w.crack[i] !== w2.crack[i]) sc++; ok(sc === 0, 'scorch/fractures restored'); w2.fx.log = () => { }; for (let i = 0; i < 600; i++) w2.tick(1 / 60); ok(w2.stats().alive === w.stats().alive || w2.stats().alive > 0, 'loaded world keeps simulating'); }
console.log(logs.slice(0, 12).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
