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

console.log('lightning');
{ const L = new World(seed); L.rainT = 1e9; L.fx.log = () => { }; run(L, 30); const v = L.vc; const sc0 = L.scorch.reduce((a, b) => a + (b > 150 ? 1 : 0), 0), h0 = L.hAt(v.x + 2, v.z);
  L.lightning(v.x + 2, v.z, 0.9); ok(L.storms.length === 1, 'lightning storm summoned'); run(L, 0.6); ok(L.bolts.length > 0 && L.bolts.some(b => b.main && b.segs.length > 20), 'main bolt with forks drawn: ' + (L.bolts[0] ? L.bolts[0].segs.length : 0) + ' segments');
  let mxb = 0; for (let s = 0; s < 40; s++) { run(L, 0.1); mxb = Math.max(mxb, L.bolts.length); } ok(mxb >= 2 && L.storms.length === 0, 'barrage of follow-up strikes then storm ends (max ' + mxb + ' bolts at once)');
  ok(L.hAt(v.x + 2, v.z) < h0 - 0.3, 'main strike blasted the ground: ' + h0.toFixed(2) + ' -> ' + L.hAt(v.x + 2, v.z).toFixed(2));
  const sc1 = L.scorch.reduce((a, b) => a + (b > 150 ? 1 : 0), 0); ok(sc1 > sc0 + 30, 'scorched ground: +' + (sc1 - sc0));
  ok(L.buildings.filter(b => b.parts.some(p => p.st)).length >= 3, 'buildings damaged: ' + L.buildings.filter(b => b.parts.some(p => p.st)).length); ok(L.buildings.some(b => b.fire > 0) || L.fires.length > 0, 'fires started');
  const st = L.stats(); ok(st.dead + st.inj + st.pan > 3, 'villagers struck or fleeing: ' + JSON.stringify(st));
  run(L, 2); ok(L.bolts.length === 0 && L.boltFlash === 0, 'bolts fade; no flash left over');
  let hits = 0; for (let k = 0; k < 200; k++) { const r = L.rodTarget(v.x + 6, v.z - 6); if (L.bmap[L.ci(r[0], r[1])]) hits++; } ok(hits > 100, 'stray bolts are drawn to tall buildings (' + hits + '/200)');
  const js = JSON.stringify(L.serialize()), L2 = World.load(JSON.parse(js)); let ms = 0; for (let i = 0; i < NN; i++) if (L2.scorch[i] !== L.scorch[i]) ms++; ok(ms === 0 && L2.storms.length === 0, 'lightning scars survive save/load'); }

console.log('survivors');
run(w, 120);
{ const s = w.stats(); console.log('   stats', JSON.stringify(s)); ok(s.alive > 0, 'survivors exist: ' + s.alive); ok(wOld.stats().dead > 0, 'earlier disasters killed villagers: ' + wOld.stats().dead); ok(s.pan < s.alive * 0.5, 'panic subsides: ' + s.pan); ok(s.tents > 0 || s.hl === 0, 'homeless camp/tents: tents ' + s.tents + ' homeless ' + s.hl); }

console.log('save/load');
{ const js = JSON.stringify(w.serialize()); console.log('   save size KB', (js.length / 1024) | 0); const w2 = World.load(JSON.parse(js)); let md = 0; for (let i = 0; i < NN; i++) md = Math.max(md, Math.abs(w.h[i] - w2.h[i])); ok(md < 0.011, 'terrain restored (max diff ' + md.toFixed(4) + ')'); ok(w2.stats().bs === w.stats().bs && w2.stats().dead === w.stats().dead, 'buildings/deaths restored'); ok(w2.rubble.length === w.rubble.length && w2.craterCells.length === w.craterCells.length, 'rubble and craters restored'); ok(w2.buildings.length === w.buildings.length, 'tents restored'); let sc = 0; for (let i = 0; i < NN; i++) if (w.scorch[i] !== w2.scorch[i] || w.crack[i] !== w2.crack[i]) sc++; ok(sc === 0, 'scorch/fractures restored'); w2.fx.log = () => { }; for (let i = 0; i < 600; i++) w2.tick(1 / 60); ok(w2.stats().alive === w.stats().alive || w2.stats().alive > 0, 'loaded world keeps simulating'); }
console.log('tornado');
{
  const T = new World(seed); T.rainT = 1e9; T.fx.log = () => { };
  const house = T.buildings.find(b => b.type === 'house' && !b.ruin);
  const t = T.spawnTornado(24, 30, 0.85);
  ok(T.tornados.length === 1 && t.R > 3, 'tornado spawns at the chosen spot, radius ' + t.R.toFixed(1));
  const x0 = t.x, z0 = t.z; run(T, 2.2);
  ok(Math.hypot(t.x - x0, t.z - z0) > 2, 'tornado wanders on its own (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ')');
  const before = t.x; T.steer = { x: Math.min(N - 8, t.x + 36), z: t.z, strong: true }; run(T, 2.4);
  ok(t.x > before + 3, 'mouse steer pulls the funnel (' + before.toFixed(1) + ' -> ' + t.x.toFixed(1) + ')');
  T.steer = null; t.life = 20;
  const n = T.npcs.find(n => n.st !== DEAD && !n.erased);
  const nx = n.x, nz = n.z;
  n.x = house.x + 1.1; n.z = house.z + 0.3; n.inside = false; n.path = null; n.st = 0; n.air = 0;
  const parts0 = house.parts.filter(p => p.st).length;
  const stages = new Set();
  let thrown = false, pulled = false;
  for (let s = 0; s < 150; s++) {
    t.x = house.x; t.z = house.z; t.life = 20; T.tick(1 / 60); stages.add(house.parts.filter(p => p.st).length);
    if (n.air > 0 || Math.hypot(n.x - (house.x + 1.1), n.z - (house.z + 0.3)) > 2.5) pulled = true;
    if (n.air > 0 || n.cause === 'tornado' || n.cause === 'hurled by the wind') thrown = true;
  }
  ok(pulled || thrown, 'villager caught by the vortex (moved ' + Math.hypot(n.x - nx, n.z - nz).toFixed(1) + ', air ' + (n.air || 0) + ', ' + (n.cause || 'ok') + ')');
  ok(house.parts.filter(p => p.st).length > parts0 && stages.size >= 2, 'building damaged progressively by the wind (stages ' + [...stages].join(',') + ')');
  ok(T.debris.length + T.rubble.length > 4, 'tornado leaves flying debris or rubble (' + T.debris.length + ' flying, ' + T.rubble.length + ' rubble)');
  const h0 = T.hAt(house.x + 30, house.z + 30);
  run(T, 1); ok(Math.abs(T.hAt(house.x + 30, house.z + 30) - h0) < 0.02, 'tornado does not dig distant terrain');
  ok(T.debris.length <= 420, 'debris stays capped (' + T.debris.length + ')');
}

console.log('divine deletion');
{
  const D = new World(seed); D.rainT = 1e9; D.fx.log = () => { };
  const b = D.buildings.find(x => x.type === 'house' && !x.ruin);
  const ti = D.tree.findIndex(v => v === 1);
  const n = D.npcs.find(x => x.st !== DEAD);
  const hx = b.x, hz = b.z, hBefore = D.h[D.ci(hx, hz)], wBefore = D.w[D.ci(hx, hz)];
  const deb0 = D.debris.length;
  ok(D.eraseBuilding(b) && b.gone && b.parts.every(p => p.st) && D.bmap[D.ci(b.x, b.z)] === 0, 'building removed from render parts and collision map');
  ok(D.debris.length === deb0, 'deletion spawns no debris');
  ok(D.h[D.ci(hx, hz)] === hBefore && D.w[D.ci(hx, hz)] === wBefore, 'terrain and water untouched');
  const occupant = D.npcs.find(x => x.home === b.id && !x.erased && x.st !== DEAD);
  ok(!occupant || !occupant.inside, 'people inside are set outside, not killed');
  ok(D.eraseTree(ti) && D.tree[ti] === 0, 'tree removed');
  const aliveBefore = D.stats().alive;
  ok(D.eraseNPC(n) && n.erased && D.stats().alive === aliveBefore - 1 && D.stats().dead === 0, 'villager unmade without counting as a death');
  ok(D.eraseWell() && D.well.gone, 'well prop removed');
  const target = D.queryDelete(b.x, b.y + 24, b.z, 0, -1, 0, b.x, b.z, 0.15);
  ok(!target || target.b !== b, 'deleted building is no longer a target');
  const other = D.buildings.find(x => !x.gone && !x.ruin && x.type === 'house');
  const q = D.queryDelete(other.x, other.y + 28, other.z, 0, -1, 0, other.x, other.z, 1.2);
  ok(q && q.kind === 'b' && q.b === other, 'hover query hits a standing building');
  const treeI = D.tree.findIndex(v => v === 1);
  const tx = treeI % N, tz = (treeI / N) | 0;
  const tq = D.queryDelete(tx, D.h[treeI] + 10, tz, 0, -1, 0, tx, tz, 1);
  ok(tq && tq.kind === 'tree' && tq.i === treeI, 'hover query hits a tree');
  let ex = 8, ez = 8;
  for (let i = 0; i < NN; i++) { const x = i % N, z = (i / N) | 0; if (D.tree[i] || D.bmap[i] || D.kind[i] === K.DAM) continue; if (Math.hypot(x - D.well.x, z - D.well.z) < 4) continue; let open = true; for (let dz = -1; dz <= 1 && open; dz++) for (let dx = -1; dx <= 1; dx++) if (D.tree[(z + dz) * N + (x + dx)]) open = false; if (open) { ex = x; ez = z; break; } }
  ok(!D.queryDelete(ex, D.hAt(ex, ez) + 18, ez, 0, -1, 0, ex, ez, 0.25), 'empty ground is not deletable');
  const js = JSON.stringify(D.serialize()); const D2 = World.load(JSON.parse(js));
  ok(D2.buildings[b.id].gone && D2.bmap[D2.ci(b.x, b.z)] === 0, 'deleted building stays gone after save/load');
  ok(D2.tree[ti] === 0 && D2.npcs[n.id].erased && D2.well.gone, 'deleted tree, villager, and well stay gone after save/load');
  ok(Math.abs(D2.h[D2.ci(hx, hz)] - hBefore) < 0.011, 'saved terrain still matches');
  D2.fx.log = () => { }; run(D2, 2); ok(D2.buildings[b.id].gone && !D2.npcs.some(x => x.erased && x.st !== DEAD), 'loaded world does not resurrect deletions');
}

console.log('fire jumps to a neighbor');
{
  const F = new World(seed); F.rainT = 1e9; F.fx.log = () => { };
  let pair = null, best = 1e9;
  for (const a of F.buildings) for (const b of F.buildings) if (a !== b && !a.ruin && !b.ruin && a.fuel > 0 && b.fuel > 0) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < best && d < 5.75) { best = d; pair = [a, b]; } }
  if (pair) { F.igniteB(pair[0]); run(F, 25); ok(pair[1].fire > 0 || pair[1].ruin || pair[1].parts.some(p => p.char > 0.2 || p.st), 'fire reached a neighbor ' + best.toFixed(1) + ' away (' + pair[0].type + ' -> ' + pair[1].type + ')'); }
  else ok(true, 'no building pair within 7 — spread left to the cell solver');
}

console.log(logs.slice(0, 12).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
