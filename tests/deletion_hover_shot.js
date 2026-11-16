const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForFunction(() => window.__game && !document.getElementById('begin').disabled, null, { timeout: 30000 });
  await p.evaluate(() => { __game.newWorld(1234); __game.world.rainT = 1e9; __game.world.time = 0.42; __game.setInt(0.7); });
  await p.click('#begin');
  await p.waitForTimeout(400);
  const ev = (f, arg) => arg === undefined ? p.evaluate(f) : p.evaluate(f, arg);
  const houses = await ev(() => __game.world.buildings.filter(b => !b.gone && !b.ruin && b.type === 'house').slice(0, 8).map(b => [b.x, b.z, b.id]));
  await p.keyboard.press('9');
  let aimed = null;
  for (const h of houses) {
    await ev(h => { const c = __game.R.cam; c.tx = c.gtx = h[0]; c.tz = c.gtz = h[1]; c.dist = c.gdist = 24; c.pitch = c.gpitch = 1.08; c.yaw = c.gyaw = 0.45; }, h);
    await p.waitForTimeout(280);
    const q = await ev(h => { const r = __game.R.project(h[0], __game.world.hAt(h[0], h[1]) + 1.2, h[1]); return [(r[0] + 1) / 2 * innerWidth, (1 - r[1]) / 2 * innerHeight, r[2]]; }, h);
    console.log('house', h, 'screen', q.map(v => +v.toFixed(1)));
    if (q[0] > 180 && q[0] < 1080 && q[1] > 70 && q[1] < 560 && q[2] > 0) { aimed = { h, q }; break; }
  }
  if (!aimed) { console.log('no on-screen house'); await b.close(); process.exit(1); }
  await p.mouse.move(aimed.q[0], aimed.q[1]);
  await p.waitForTimeout(350);
  const info = await ev(() => { const hit = __game.mouse.hit, hv = __game.delHover; return { hit: hit && [+hit.x.toFixed(1), +hit.z.toFixed(1)], kind: hv && hv.kind, id: hv && hv.b && hv.b.id }; });
  console.log('hover', info, 'wanted', aimed.h);
  await p.screenshot({ path: '/opt/cursor/artifacts/ability_deletion_hover.png' });
  await ev(() => __game.setSpeed(0));
  await p.mouse.click(aimed.q[0], aimed.q[1]);
  await p.waitForTimeout(180);
  const after = await ev(id => { const b = __game.world.buildings[id], i = __game.world.ci(b.x, b.z); return { gone: !!b.gone, h: +__game.world.h[i].toFixed(2), fades: __game.world.fades.length }; }, aimed.h[2]);
  console.log('after click', after);
  await p.screenshot({ path: '/opt/cursor/artifacts/ability_deletion.png' });
  await b.close();
  process.exit(after.gone && after.fades > 0 ? 0 : 1);
})().catch(e => { console.log(e); process.exit(1); });