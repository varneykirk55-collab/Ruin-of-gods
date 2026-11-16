const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.env.SHOTS || path.join(__dirname, '../artifacts');
fs.mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForFunction(() => window.__game && !document.getElementById('begin').disabled, null, { timeout: 30000 });
  await p.evaluate(() => { __game.newWorld(1234); __game.world.rainT = 1e9; __game.world.time = 0.42; __game.setInt(0.75); });
  await p.click('#begin');
  await p.waitForTimeout(400);
  const ev = (f, arg) => arg === undefined ? p.evaluate(f) : p.evaluate(f, arg);
  const ff = s => p.evaluate(s => { const w = __game.world; for (let i = 0; i < s * 60; i++) w.tick(1 / 60); }, s);
  const scr = (x, z, height = 0.4) => p.evaluate(([x, z, height]) => { const g = __game, w = g.world, q = g.R.project(x, w.hAt(x, z) + height, z); return [(q[0] + 1) / 2 * innerWidth, (1 - q[1]) / 2 * innerHeight]; }, [x, z, height]);
  const cam = async o => { await p.evaluate(o => { const c = __game.R.cam; for (const k in o) { c[k] = o[k]; c['g' + k] = o[k]; } }, o); await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); };
  const shot = name => p.screenshot({ path: path.join(out, name) });
  const vc = await ev(() => __game.world.vc);
  ok(await ev(() => document.querySelectorAll('#tools button').length === 9), 'nine tools: observe through divine deletion, lightning kept');
  await cam({ tx: vc.x, tz: vc.z, dist: 58, pitch: 0.78, yaw: 0.45 });
  await p.waitForTimeout(500);

  console.log('earthquake');
  await p.keyboard.press('2');
  let a = await scr(vc.x - 14, vc.z - 16), c = await scr(vc.x + 12, vc.z + 14);
  const h0 = await ev(() => { let n = 0; const w = __game.world; for (let i = 0; i < w.h.length; i++) if (Math.abs(w.h[i] - w.h0[i]) > 0.3) n++; return n; });
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(c[0], c[1], { steps: 6 }); await p.mouse.up();
  ok(await ev(() => __game.world.quakes.length === 1), 'earthquake drag started a quake');
  await p.waitForTimeout(900); await shot('ability_earthquake.png'); await ff(6);
  const h1 = await ev(() => { let n = 0; const w = __game.world; for (let i = 0; i < w.h.length; i++) if (Math.abs(w.h[i] - w.h0[i]) > 0.3) n++; return n; });
  ok(h1 > h0 + 80, 'earthquake fractured terrain (' + (h1 - h0) + ' cells)');

  console.log('flood');
  await ev(() => { __game.newWorld(1234); __game.world.rainT=1e9; });
  await cam({tx:vc.x+20,tz:vc.z+14,dist:48,yaw:0.2,pitch:0.9});
  await p.waitForTimeout(300);
  await ev(() => { const w=__game.world; window.__floodSnapshot={h:Array.from(w.h),w:Array.from(w.w)}; });
  await p.keyboard.press('3'); a = await scr(vc.x+20,vc.z+14);
  await p.mouse.move(a[0],a[1]); await p.mouse.down(); await p.waitForTimeout(1200); await p.mouse.up();
  ok(await ev(() => __game.world.h.every((v,i)=>v===__floodSnapshot.h[i])), 'Flood leaves all terrain elevations unchanged');
  ok(await ev(() => __game.world.w.some((v,i)=>v>__floodSnapshot.w[i]+0.5)), 'Flood introduces visible water');
  ok(await ev(() => !__game.world.damBroken), 'Flood does not excavate or breach the dam');
  await ff(12); await shot('ability_flood.png');
  ok(await ev(() => {const w=__game.world; return w.w.some((v,i)=>v>__floodSnapshot.w[i]+0.1 && w.h[i]<w.h[w.ci(w.vc.x+20,w.vc.z+14)]);}), 'summoned water persists and runs downhill');

  console.log('meteor');
  await cam({ tx: vc.x + 18, tz: vc.z + 4, dist: 64, yaw: 0.5, pitch: 0.72 }); await p.waitForTimeout(250);
  await p.keyboard.press('4'); a = await scr(vc.x + 24, vc.z + 6);
  const mh = await ev(() => __game.world.hAt(__game.world.vc.x + 24, __game.world.vc.z + 6));
  await p.mouse.click(a[0], a[1]);
  ok(await ev(() => __game.world.meteors.length === 1), 'meteor summoned');
  await p.waitForTimeout(700); await shot('ability_meteor.png'); await ff(4);
  ok(await ev(() => __game.world.hAt(__game.world.vc.x + 24, __game.world.vc.z + 6)) < mh - 2, 'meteor dug a crater');

  console.log('divine finger');
  const house = await ev(() => { const b = __game.world.buildings.find(b => !b.ruin && !b.gone && b.type === 'house'); return b ? [b.x, b.z, b.id] : null; });
  await p.keyboard.press('5'); await cam({ tx: house[0], tz: house[1], dist: 28, pitch: 0.7, yaw: 0.6 }); await p.waitForTimeout(300);
  a = await scr(house[0], house[1]); await p.mouse.move(a[0], a[1]); await p.waitForTimeout(250); await shot('ability_finger.png');
  await p.mouse.down(); await p.waitForFunction(id => __game.world.buildings[id].parts.filter(pt => pt.st).length >= 4, house[2], {timeout:20000}); await p.mouse.up(); await ff(0.4);
  ok(await ev(id => __game.world.buildings[id].parts.filter(pt => pt.st).length >= 4, house[2]), 'finger crushed the house');

  console.log('firestorm');
  const fc = await ev(() => { const w = __game.world; let best = 0, bi = 0; for (let z = 70; z < 140; z++) for (let x = 20; x < 140; x++) { let c = 0; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const i = (z + dz) * 160 + x + dx; if (w.tree[i] === 1) c++; } if (c > best) { best = c; bi = z * 160 + x; } } return [bi % 160, (bi / 160) | 0, best]; });
  await p.keyboard.press('6'); await cam({ tx: fc[0], tz: fc[1], dist: 42, pitch: 0.75, yaw: 0.3 }); await p.waitForTimeout(250);
  a = await scr(fc[0], fc[1]); const f0 = await ev(() => __game.world.fires.length);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.waitForTimeout(700); await shot('ability_firestorm.png'); await p.mouse.up();
  ok((await ev(() => __game.world.fires.length)) > f0, 'firestorm ignited land (' + fc[2] + ' trees nearby)');

  console.log('lightning');
  await cam({ tx: vc.x + 6, tz: vc.z - 2, dist: 48, pitch: 0.62, yaw: 0.9 }); await p.waitForTimeout(200);
  await p.keyboard.press('7'); a = await scr(vc.x + 6, vc.z - 2);
  await p.mouse.click(a[0], a[1]);
  ok(await ev(() => __game.world.storms.length === 1), 'lightning storm started');
  await ff(0.6); await shot('ability_lightning.png');
  ok(await ev(() => __game.world.bolts.length > 0 || __game.world.storms.length === 0), 'lightning produced a bolt or already struck');

  console.log('tornado');
  await cam({ tx: vc.x + 2, tz: vc.z + 2, dist: 46, pitch: 0.68, yaw: 0.55 }); await p.waitForTimeout(250);
  await p.keyboard.press('8');
  ok(await ev(() => __game.tool === 'tornado'), 'tornado tool selected');
  a = await scr(vc.x + 2, vc.z + 2); await p.mouse.click(a[0], a[1]);
  ok(await ev(() => __game.world.tornados.length === 1), 'click spawned a tornado');
  const t0 = await ev(() => { const t = __game.world.tornados[0]; return { x: t.x, z: t.z }; });
  await p.waitForTimeout(450); await shot('ability_tornado.png');
  const aim = await scr(vc.x + 20, vc.z + 8);
  await p.mouse.move(aim[0], aim[1]); await p.waitForTimeout(1400);
  const t1 = await ev(() => { const t = __game.world.tornados[0]; return t ? { x: t.x, z: t.z, debris: __game.world.debris.length } : null; });
  ok(t1 && Math.hypot(t1.x - t0.x, t1.z - t0.z) > 1.2, 'mouse steered the tornado (' + t0.x.toFixed(1) + ',' + t0.z.toFixed(1) + ' -> ' + (t1 ? t1.x.toFixed(1) + ',' + t1.z.toFixed(1) : 'gone') + ')');
  await ff(2.5);
  const tornFx = await ev(() => { const w = __game.world; const hurt = w.buildings.filter(b => b.parts.some(pt => pt.st) && !b.gone).length; const tossed = w.npcs.filter(n => n.cause === 'tornado' || n.cause === 'hurled by the wind' || n.air > 0).length; return { hurt, tossed, debris: w.debris.length, rubble: w.rubble.length }; });
  ok(tornFx.hurt > 0 || tornFx.debris + tornFx.rubble > 4, 'tornado damaged buildings or threw debris ' + JSON.stringify(tornFx));
  ok(tornFx.tossed > 0 || tornFx.debris > 2, 'tornado pulled villagers or loose objects ' + JSON.stringify(tornFx));

  console.log('divine deletion');
  await ev(() => __game.setSpeed(0));
  const target = await ev(() => { const b = __game.world.buildings.find(b => !b.gone && !b.ruin && b.type === 'house'); return b ? { x: b.x, z: b.z, id: b.id, h: __game.world.h[__game.world.ci(b.x, b.z)], water: __game.world.w[__game.world.ci(b.x, b.z)] } : null; });
  await p.keyboard.press('9');
  await cam({ tx: target.x, tz: target.z, dist: 24, pitch: 0.62, yaw: 0.4 }); await p.waitForTimeout(300);
  a = await scr(target.x, target.z, 1.5); await p.mouse.move(a[0], a[1]); await p.waitForFunction(id=>__game.delHover&&__game.delHover.kind==='b'&&__game.delHover.b.id===id,target.id,{timeout:10000});
  const hover = await ev(() => { const h = __game.delHover; return h ? h.kind + (h.b ? ':' + h.b.id : '') : ''; });
  ok(hover.startsWith('b:' + target.id), 'hover highlights the house (' + hover + ')');
  await shot('ability_deletion_hover.png');
  const trees0 = await ev(() => __game.world.tree.reduce((a, b) => a + (b ? 1 : 0), 0));
  await p.mouse.click(a[0], a[1]); await p.waitForTimeout(200); await shot('ability_deletion.png');
  const gone = await ev(id => { const b = __game.world.buildings[id]; const i = __game.world.ci(b.x, b.z); return { gone: !!b.gone, map: __game.world.bmap[i], debris: __game.world.debris.length, h: __game.world.h[i], w: __game.world.w[i] }; }, target.id);
  ok(gone.gone && gone.map === 0, 'click deleted the house and cleared its collider');
  ok(gone.h === target.h, 'object deletion leaves terrain unchanged');
  const grove = await ev(() => { const w = __game.world; for (let i = 0; i < w.tree.length; i++) if (w.tree[i] === 1) { const x = i % 160, z = (i / 160) | 0; if(x<12||x>145||z<20||z>145)continue; let n = 0, last=0; for (let k = 0; k < 6; k++) if (w.tree[i + k] === 1) {n++;last=k;} if (n >= 3) return [x, z, last]; } return null; });
  if (grove) {
    await cam({ tx: grove[0], tz: grove[1], dist: 24, pitch: 1.4, yaw: 0.2 }); await p.waitForTimeout(250);
    const g0 = await scr(grove[0], grove[1], 1.4), g1 = await scr(grove[0] + grove[2], grove[1], 1.4);
    await p.mouse.move(g0[0], g0[1]); await p.waitForFunction(()=>__game.delHover&&__game.delHover.kind==='tree',null,{timeout:10000}); await p.mouse.down(); await p.mouse.move(g1[0], g1[1], { steps: 8 }); await p.mouse.up();
    const trees1 = await ev(() => __game.world.tree.reduce((a, b) => a + (b ? 1 : 0), 0));
    ok(trees1 < trees0, 'drag-delete removed trees (' + trees0 + ' -> ' + trees1 + ')');
  } else ok(false, 'no tree grove to drag-delete');

  console.log('persistence');
  const sig = await ev(() => { const w = __game.world; const gone = w.buildings.filter(b => b.gone).map(b => b.id).join(','); const trees = w.tree.reduce((a, b) => a + (b ? 1 : 0), 0); return gone + '|' + trees + '|' + (w.well.gone ? 1 : 0); });
  await p.click('#save'); await p.reload();
  await p.waitForFunction(() => window.__game && !document.getElementById('begin').disabled, null, { timeout: 30000 });
  await p.click('#cont'); await p.waitForTimeout(600);
  const sig2 = await ev(() => { const w = __game.world; const gone = w.buildings.filter(b => b.gone).map(b => b.id).join(','); const trees = w.tree.reduce((a, b) => a + (b ? 1 : 0), 0); return gone + '|' + trees + '|' + (w.well.gone ? 1 : 0); });
  ok(sig === sig2, 'deleted objects stay gone after reload (' + sig2 + ')');

  console.log('performance');
  await ev(() => {__game.newWorld(1234);__game.world.rainT=1e9;__game.setSpeed(1);});
  await cam({tx:vc.x,tz:vc.z,dist:78,pitch:0.85,yaw:0.5});
  const baseline = await p.evaluate(() => new Promise(resolve => {
    const samples=[];let last=performance.now();
    function frame(t){samples.push(t-last);last=t;if(samples.length<30)requestAnimationFrame(frame);else resolve(1000/(samples.reduce((a,b)=>a+b,0)/samples.length));}
    requestAnimationFrame(frame);
  }));
  console.log('  calm baseline fps',baseline.toFixed(1));
  await ev(() => { const w = __game.world, v = w.vc; w.rainT = 1e9; __game.setInt(0.8); w.quake(v.x - 10, v.z - 12, v.x + 16, v.z + 14, 0.7); w.meteor(v.x + 14, v.z - 6, 0.6); w.ignite(v.x - 8, v.z + 10, 0.7); w.spawnTornado(v.x, v.z, 0.7); w.lightning(v.x + 4, v.z + 4, 0.6); });
  await cam({ tx: vc.x, tz: vc.z, dist: 78, pitch: 0.85, yaw: 0.5 });
  const perf = await p.evaluate(() => new Promise(res => { const samples = []; let last = performance.now(), n = 0; const step = t => { samples.push(t - last); last = t; if (++n < 90) requestAnimationFrame(step); else { samples.sort((a, b) => a - b); const avg = samples.reduce((s, x) => s + x, 0) / samples.length; res({ fps: 1000 / avg, avg: avg, p95: samples[Math.floor(samples.length * 0.95)], worst: samples[samples.length - 1], gameFps: __game.fps.fps }); } }; requestAnimationFrame(step); }));
  console.log('  fps', perf.fps.toFixed(1), 'avg ms', perf.avg.toFixed(2), 'p95', perf.p95.toFixed(1), 'worst', perf.worst.toFixed(1), 'hud', perf.gameFps.toFixed(1));
  ok(perf.fps > 0 && perf.fps >= baseline * 0.65, 'stacked disasters retain at least 65% of software-rendered baseline (' + perf.fps.toFixed(1) + ' vs ' + baseline.toFixed(1) + ' fps, p95 ' + perf.p95.toFixed(1) + ' ms)');
  await shot('ability_stacked.png');
  fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify({...perf,baselineFps:baseline,retained:perf.fps/baseline}, null, 2));
  console.log(errs.length ? 'console errors:\n' + errs.slice(0, 8).join('\n') : 'no console errors');
  if (errs.length) fail++;
  console.log(`\n${pass} passed, ${fail} failed`);
  const video = p.video();
  await ctx.close(); await b.close();
  if (video) { const vp = await video.path(); const dest = path.join(out, 'abilities_playthrough.webm'); fs.copyFileSync(vp, dest); console.log('video', dest); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e.stack || e); process.exit(1); });
