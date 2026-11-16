const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForFunction(() => window.__game && !document.getElementById('begin').disabled, null, { timeout: 30000 });
  await p.evaluate(() => { __game.newWorld(1234); __game.world.rainT = 1e9; __game.world.time = 0.42; __game.setInt(0.72); });
  await p.click('#begin');
  await p.waitForTimeout(400);
  await p.keyboard.press('9');
  const spot = await p.evaluate(() => {
    const w = __game.world;
    for (let z = 78; z < 120; z++) for (let x = 30; x < 70; x++) {
      const i = z * 160 + x;
      if (!w.canEraseLand(i) || w.tree[i] || w.bmap[i] || w.kind[i] === 5) continue;
      if (Math.hypot(x - w.vc.x, z - w.vc.z) < 16) continue;
      return [x, z];
    }
    return [48, 88];
  });
  await p.evaluate(s => { const c = __game.R.cam; c.tx = c.gtx = s[0]; c.tz = c.gtz = s[1]; c.dist = c.gdist = 34; c.pitch = c.gpitch = 1.08; c.yaw = c.gyaw = 0.35; }, spot);
  await p.waitForTimeout(400);
  const q = await p.evaluate(s => { const r = __game.R.project(s[0], __game.world.hAt(s[0], s[1]) + 0.2, s[1]); return [(r[0] + 1) / 2 * innerWidth, (1 - r[1]) / 2 * innerHeight]; }, spot);
  const aim = (q[0] > 80 && q[0] < 1200 && q[1] > 60 && q[1] < 580) ? q : [640, 360];
  console.log('spot', spot, 'projected', q, 'aim', aim);
  await p.mouse.move(aim[0], aim[1]);
  await p.waitForTimeout(400);
  const brush = await p.evaluate(() => ({ mark: __game.R.mark[2], radius: __game.world.eraseRadius(0.72), on: __game.R.brush, a: __game.R.markC[3], hit: __game.mouse.hit && [__game.mouse.hit.x, __game.mouse.hit.z] }));
  console.log(brush);
  await p.screenshot({ path: '/opt/cursor/artifacts/ability_deletion_brush.png' });
  await b.close();
  process.exit(brush.on === 1 && Math.abs(brush.mark - brush.radius) < 0.05 ? 0 : 1);
})().catch(e => { console.log(e); process.exit(1); });