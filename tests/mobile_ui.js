'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const out = process.env.SHOTS || path.join(__dirname, '../artifacts/mobile');
fs.mkdirSync(out, { recursive: true });

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
};

function overlaps(a, b, pad = 2) {
  if (!a || !b) return false;
  return !(a.right <= b.left + pad || a.left >= b.right - pad || a.bottom <= b.top + pad || a.top >= b.bottom - pad);
}

function insideViewport(r, vw, vh) {
  return r && r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1 && r.width > 0 && r.height > 0;
}

async function box(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
}

async function dispatchTouchDrag(page, x0, y0, x1, y1, steps = 8, holdBeforeMoveMs = 0, holdAtEndMs = 0) {
  await page.evaluate(({ x0, y0 }) => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 101, pointerType: 'touch', clientX: x0, clientY: y0, bubbles: true, cancelable: true, button: 0, isPrimary: true
    }));
  }, { x0, y0 });
  if (holdBeforeMoveMs > 0) await page.waitForTimeout(holdBeforeMoveMs);
  for (let i = 1; i <= steps; i++) {
    const x = x0 + (x1 - x0) * (i / steps);
    const y = y0 + (y1 - y0) * (i / steps);
    await page.evaluate(({ x, y }) => {
      const c = document.getElementById('c');
      c.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 101, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true
      }));
    }, { x, y });
    await page.waitForTimeout(20);
  }
  if (holdAtEndMs > 0) await page.waitForTimeout(holdAtEndMs);
  await page.evaluate(({ x1, y1 }) => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 101, pointerType: 'touch', clientX: x1, clientY: y1, bubbles: true, cancelable: true, button: 0, isPrimary: true
    }));
  }, { x1, y1 });
}

async function dispatchTwoFingerPinch(page, cx, cy, d0, d1, staggerMs = 25) {
  await page.evaluate(({ cx, cy, d0 }) => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 201, pointerType: 'touch', clientX: cx - d0 / 2, clientY: cy, bubbles: true, cancelable: true, button: 0, isPrimary: true
    }));
  }, { cx, cy, d0 });
  if (staggerMs > 0) await page.waitForTimeout(staggerMs);
  await page.evaluate(({ cx, cy, d0, d1 }) => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 202, pointerType: 'touch', clientX: cx + d0 / 2, clientY: cy, bubbles: true, cancelable: true, button: 0, isPrimary: false
    }));
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const d = d0 + (d1 - d0) * (i / steps);
      c.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 201, pointerType: 'touch', clientX: cx - d / 2, clientY: cy + i * 2, bubbles: true, cancelable: true
      }));
      c.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 202, pointerType: 'touch', clientX: cx + d / 2, clientY: cy + i * 2, bubbles: true, cancelable: true
      }));
    }
    c.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 202, pointerType: 'touch', clientX: cx + d1 / 2, clientY: cy + 12, bubbles: true, cancelable: true, button: 0
    }));
    c.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 201, pointerType: 'touch', clientX: cx - d1 / 2, clientY: cy + 12, bubbles: true, cancelable: true, button: 0
    }));
  }, { cx, cy, d0, d1 });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });

  const url = 'file://' + path.resolve(__dirname, '../index.html');

  // ==================== 1. LANDSCAPE PHONE (844x390 + 667x375) ====================
  console.log('=== Mobile Landscape (844x390) ===');
  const mCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const mp = await mCtx.newPage();
  const mErrs = [];
  mp.on('console', m => { if (m.type() === 'error') mErrs.push(m.text()); });
  mp.on('pageerror', e => mErrs.push('PAGEERR ' + e.message));

  await mp.goto(url);
  await mp.waitForFunction(() => window.__game && !document.getElementById('begin').disabled, null, { timeout: 30000 });
  await mp.evaluate(() => { __game.newWorld(1234); __game.world.rainT = 1e9; __game.world.time = 0.42; });
  const beginBox = await box(mp, '#begin');
  ok(insideViewport(beginBox, 844, 390), 'start screen Begin button fits inside 844x390 landscape viewport');
  await mp.screenshot({ path: path.join(out, '01_mobile_start_landscape.png') });
  await mp.touchscreen.tap(beginBox.left + beginBox.width / 2, beginBox.top + beginBox.height / 2);
  await mp.waitForTimeout(500);

  const statsB = await box(mp, '#stats');
  const sysB = await box(mp, '#sys');
  const barB = await box(mp, '#bar');
  ok(insideViewport(statsB, 844, 390) && insideViewport(sysB, 844, 390) && insideViewport(barB, 844, 390), 'all HUD panels fit inside 844x390');
  ok(!overlaps(statsB, sysB) && !overlaps(statsB, barB) && !overlaps(sysB, barB), 'HUD panels do not overlap in 844x390 landscape');
  ok(await mp.evaluate(() => document.getElementById('stats').classList.contains('collapsed')), 'stats HUD starts collapsed on landscape phone');
  ok(barB.top - Math.max(statsB.bottom, sysB.bottom) > 220, 'world area unobstructed (' + (barB.top - Math.max(statsB.bottom, sysB.bottom)).toFixed(0) + 'px clear center height)');
  await mp.screenshot({ path: path.join(out, '02_mobile_landscape_observe.png') });

  // Test 667x375 compact landscape too
  await mp.setViewportSize({ width: 667, height: 375 });
  await mp.waitForTimeout(200);
  const s667 = await box(mp, '#stats'), y667 = await box(mp, '#sys'), b667 = await box(mp, '#bar');
  ok(insideViewport(s667, 667, 375) && insideViewport(y667, 667, 375) && insideViewport(b667, 667, 375) && !overlaps(s667, y667) && !overlaps(s667, b667) && !overlaps(y667, b667), '667x375 compact landscape fits without overlap');
  await mp.screenshot({ path: path.join(out, '03_mobile_667x375.png') });
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.waitForTimeout(200);

  // ==================== 2 & 3. ALL POWERS ACCESSIBLE & TOUCH SELECTION ====================
  console.log('=== Power Selection & Touch Targets ===');
  const toolMetrics = await mp.evaluate(() => {
    return [...document.querySelectorAll('#tools button')].map(b => {
      const r = b.getBoundingClientRect();
      return { id: b.dataset.t, w: r.width, h: r.height };
    });
  });
  ok(toolMetrics.length === 8 && toolMetrics.every(t => t.w >= 44 && t.h >= 44), 'all 8 ability buttons meet >=44px touch target size');

  const expectedIds = ['observe', 'quake', 'flood', 'meteor', 'finger', 'fire', 'lightning', 'tornado'];
  let allSelected = true;
  for (const id of expectedIds) {
    await mp.evaluate(id => {
      const b = document.querySelector(`#tools button[data-t="${id}"]`);
      b.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, id);
    await mp.waitForTimeout(60);
    const tb = await box(mp, `#tools button[data-t="${id}"]`);
    await mp.touchscreen.tap(tb.left + tb.width / 2, tb.top + tb.height / 2);
    const cur = await mp.evaluate(() => __game.tool);
    if (cur !== id) allSelected = false;
  }
  ok(allSelected, 'every ability responds cleanly to touch tap selection');

  // Intensity popover on mobile
  const ib = await box(mp, '#inten-btn');
  await mp.touchscreen.tap(ib.left + ib.width / 2, ib.top + ib.height / 2);
  await mp.waitForTimeout(100);
  ok(await mp.evaluate(() => document.getElementById('bar').classList.contains('inten-open')), 'intensity button opens compact intensity popover');
  const p25 = await box(mp, '.inten-presets button[data-p="25"]');
  await mp.touchscreen.tap(p25.left + p25.width / 2, p25.top + p25.height / 2);
  ok(await mp.evaluate(() => document.getElementById('rv-mini').textContent === '25%'), 'intensity preset updates intensity to 25%');
  // Close intensity popover by tapping it again
  await mp.touchscreen.tap(ib.left + ib.width / 2, ib.top + ib.height / 2);

  // ==================== 4. CAMERA PAN WITHOUT ACCIDENTAL DESTRUCTION ====================
  console.log('=== Touch Camera Panning & Pinch Safety ===');
  await mp.evaluate(() => __game.setTool('observe'));
  const c0 = await mp.evaluate(() => ({ x: __game.R.cam.gtx, z: __game.R.cam.gtz }));
  await dispatchTouchDrag(mp, 420, 190, 520, 230, 6);
  const c1 = await mp.evaluate(() => ({ x: __game.R.cam.gtx, z: __game.R.cam.gtz }));
  ok(Math.hypot(c1.x - c0.x, c1.z - c0.z) > 1.5, '1-finger drag pans camera in Observe mode');

  // Single-tap power (Meteor) drag -> pans without spawning meteor!
  await mp.evaluate(() => { __game.setTool('meteor'); __game.world.meteors.length = 0; });
  const c2 = await mp.evaluate(() => ({ x: __game.R.cam.gtx, z: __game.R.cam.gtz }));
  await dispatchTouchDrag(mp, 420, 190, 510, 220, 6);
  const c3 = await mp.evaluate(() => ({ x: __game.R.cam.gtx, z: __game.R.cam.gtz }));
  const mAfterDrag = await mp.evaluate(() => __game.world.meteors.length);
  ok(Math.hypot(c3.x - c2.x, c3.z - c2.z) > 1.0 && mAfterDrag === 0, '1-finger drag while Meteor is selected pans safely with 0 meteors');

  // Pan mode toggle with drag power (Earthquake)
  await mp.evaluate(() => { __game.setTool('quake'); __game.world.quakes.length = 0; });
  const panBtnBox = await box(mp, '#pan-btn');
  await mp.touchscreen.tap(panBtnBox.left + panBtnBox.width / 2, panBtnBox.top + panBtnBox.height / 2);
  ok(await mp.evaluate(() => __game.panMode === true), 'Move toggle activates 1-finger pan mode without losing selected power');
  const c4 = await mp.evaluate(() => ({ x: __game.R.cam.gtx, z: __game.R.cam.gtz }));
  await dispatchTouchDrag(mp, 420, 190, 520, 230, 6);
  const c5 = await mp.evaluate(() => ({ x: __game.R.cam.gtx, z: __game.R.cam.gtz }));
  ok(Math.hypot(c5.x - c4.x, c5.z - c4.z) > 1.0 && (await mp.evaluate(() => __game.world.quakes.length)) === 0, 'Move toggle pans without triggering Earthquake');
  await mp.touchscreen.tap(panBtnBox.left + panBtnBox.width / 2, panBtnBox.top + panBtnBox.height / 2);

  // ==================== 5. TWO-FINGER PINCH DOES NOT ACTIVATE ABILITIES ====================
  console.log('=== Two-Finger Pinch Safety ===');
  await mp.evaluate(() => { __game.setTool('meteor'); __game.world.meteors.length = 0; });
  const d0 = await mp.evaluate(() => __game.R.cam.gdist);
  await dispatchTwoFingerPinch(mp, 422, 195, 120, 240, 25);
  const d1 = await mp.evaluate(() => __game.R.cam.gdist);
  ok(d1 < d0 * 0.75 && (await mp.evaluate(() => __game.world.meteors.length)) === 0, 'staggered 2-finger pinch zooms without summoning meteor (' + d0.toFixed(1) + ' -> ' + d1.toFixed(1) + ')');

  await mp.evaluate(() => { __game.setTool('quake'); __game.world.quakes.length = 0; });
  await dispatchTwoFingerPinch(mp, 422, 195, 220, 110, 25);
  const d2 = await mp.evaluate(() => __game.R.cam.gdist);
  ok(d2 > d1 * 1.4 && (await mp.evaluate(() => __game.world.quakes.length)) === 0, 'staggered 2-finger pinch zooms out without starting earthquake');

  // ==================== 6. TOUCH POWERS (TAP + DRAG) ====================
  console.log('=== Touch Power Execution ===');
  const scr = (x, z) => mp.evaluate(([x, z]) => {
    const g = __game, w = g.world, q = g.R.project(x, w.hAt(x, z), z);
    return [(q[0] + 1) / 2 * innerWidth, (1 - q[1]) / 2 * innerHeight];
  }, [x, z]);
  const vc = await mp.evaluate(() => __game.world.vc);
  const cam = async o => {
    await mp.evaluate(o => { const c = __game.R.cam; for (const k in o) { c[k] = o[k]; c['g' + k] = o[k]; } }, o);
    await mp.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));
  };
  await cam({ tx: vc.x, tz: vc.z, dist: 56, pitch: 0.78, yaw: 0.45 });

  // Meteor tap
  await mp.evaluate(() => { __game.setTool('meteor'); __game.world.meteors.length = 0; });
  let pt = await scr(vc.x + 8, vc.z + 4);
  await mp.touchscreen.tap(pt[0], pt[1]);
  ok((await mp.evaluate(() => __game.world.meteors.length)) === 1, 'tap summons meteor on touch');

  // Earthquake drag
  await mp.evaluate(() => { __game.setTool('quake'); __game.world.quakes.length = 0; });
  const qa = await scr(vc.x - 10, vc.z - 10), qb = await scr(vc.x + 10, vc.z + 10);
  await dispatchTouchDrag(mp, qa[0], qa[1], qb[0], qb[1], 6, 80);
  ok((await mp.evaluate(() => __game.world.quakes.length)) === 1, 'touch drag draws fault line and triggers earthquake');

  // Flood drag
  await mp.evaluate(() => { __game.setTool('flood'); window.__w0 = __game.world.w.reduce((a, b) => a + b, 0); });
  await dispatchTouchDrag(mp, qa[0], qa[1], qb[0], qb[1], 6, 90);
  ok(await mp.evaluate(() => __game.world.w.reduce((a, b) => a + b, 0) > window.__w0 + 1), 'touch hold/drag emits flood water');

  // Tornado tap + steer drag
  await mp.evaluate(() => { __game.setTool('tornado'); __game.world.tornados.length = 0; });
  pt = await scr(vc.x, vc.z);
  await mp.touchscreen.tap(pt[0], pt[1]);
  ok((await mp.evaluate(() => __game.world.tornados.length)) === 1, 'touch tap spawns tornado');
  const t0 = await mp.evaluate(() => ({ x: __game.world.tornados[0].x, z: __game.world.tornados[0].z }));
  const aim = await scr(vc.x + 22, vc.z + 10);
  await dispatchTouchDrag(mp, pt[0], pt[1], aim[0], aim[1], 10, 90, 900);
  const t1 = await mp.evaluate(() => ({ x: __game.world.tornados[0].x, z: __game.world.tornados[0].z }));
  ok(Math.hypot(t1.x - t0.x, t1.z - t0.z) > 0.6, 'touch drag steers tornado (' + Math.hypot(t1.x - t0.x, t1.z - t0.z).toFixed(2) + ')');

  // ==================== 7 & 9. MENUS, SAVE/LOAD, SPEED, MUTE ====================
  console.log('=== Menus, Save/Load, Speed & Disaster Readability ===');
  await mp.evaluate(() => { __game.setTool('meteor'); __game.world.meteors.length = 0; });
  const menub = await box(mp, '#menub');
  await mp.touchscreen.tap(menub.left + menub.width / 2, menub.top + menub.height / 2);
  await mp.waitForTimeout(100);
  ok(await mp.evaluate(() => document.getElementById('sys-actions').classList.contains('open')), 'Menu button opens mobile menu popover');
  await mp.screenshot({ path: path.join(out, '04_mobile_menu_open.png') });

  // Save while menu is open
  const saveB = await box(mp, '#save');
  await mp.touchscreen.tap(saveB.left + saveB.width / 2, saveB.top + saveB.height / 2);
  await mp.waitForTimeout(120);
  ok(await mp.evaluate(() => !document.getElementById('sys-actions').classList.contains('open')), 'tapping Save saves and closes mobile menu');

  // Reopen menu and tap backdrop -> must NOT trigger meteor!
  await mp.touchscreen.tap(menub.left + menub.width / 2, menub.top + menub.height / 2);
  await mp.waitForTimeout(100);
  await mp.touchscreen.tap(300, 180);
  await mp.waitForTimeout(120);
  ok(await mp.evaluate(() => !document.getElementById('sys-actions').classList.contains('open') && __game.world.meteors.length === 0), 'tapping menu backdrop closes menu without triggering Meteor');

  // Open Help via Menu -> test Help suspension & close
  await mp.touchscreen.tap(menub.left + menub.width / 2, menub.top + menub.height / 2);
  await mp.waitForTimeout(100);
  const helpB = await box(mp, '#helpb');
  await mp.touchscreen.tap(helpB.left + helpB.width / 2, helpB.top + helpB.height / 2);
  await mp.waitForTimeout(100);
  ok(await mp.evaluate(() => document.getElementById('help').classList.contains('show')), 'Help modal opens from mobile menu');
  await mp.screenshot({ path: path.join(out, '05_mobile_help_modal.png') });
  const hClose = await box(mp, '#help-close');
  await mp.touchscreen.tap(hClose.left + hClose.width / 2, hClose.top + hClose.height / 2);
  await mp.waitForTimeout(100);
  ok(await mp.evaluate(() => !document.getElementById('help').classList.contains('show') && __game.world.meteors.length === 0), 'closing Help does not trigger world powers');

  // Speed & Mute
  const sp0 = await box(mp, '#speed button[data-s="0"]');
  await mp.touchscreen.tap(sp0.left + sp0.width / 2, sp0.top + sp0.height / 2);
  ok(await mp.evaluate(() => document.querySelector('#speed button[data-s="0"]').classList.contains('on')), 'Pause button activates on touch');
  const sp1 = await box(mp, '#speed button[data-s="1"]');
  await mp.touchscreen.tap(sp1.left + sp1.width / 2, sp1.top + sp1.height / 2);
  const mq = await box(mp, '#mute-quick');
  await mp.touchscreen.tap(mq.left + mq.width / 2, mq.top + mq.height / 2);
  ok(await mp.evaluate(() => __game.audio.muted === true), 'Quick mute toggles sound on touch');

  // ==================== 8. HUD READABLE DURING DISASTERS ====================
  await mp.evaluate(() => {
    const w = __game.world, v = w.vc;
    w.quake(v.x - 10, v.z - 10, v.x + 12, v.z + 12, 0.7);
    w.ignite(v.x - 4, v.z + 6, 0.7);
    w.spawnTornado(v.x + 4, v.z, 0.7);
  });
  await mp.waitForTimeout(600);
  const stTog = await box(mp, '#stats-toggle');
  await mp.touchscreen.tap(stTog.left + stTog.width / 2, stTog.top + stTog.height / 2);
  await mp.waitForTimeout(250);
  const expStats = await box(mp, '#stats');
  ok(insideViewport(expStats, 844, 390) && !(await mp.evaluate(() => document.getElementById('stats').classList.contains('collapsed'))), 'stats HUD expands cleanly on touch during active disasters');
  await mp.screenshot({ path: path.join(out, '06_mobile_disaster_expanded.png') });
  await mp.touchscreen.tap(stTog.left + stTog.width / 2, stTog.top + stTog.height / 2);

  // ==================== 10 & 12. PORTRAIT PHONE (390x844) & ROTATION ====================
  console.log('=== Portrait Phone (390x844) & Rotation ===');
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.waitForTimeout(250);
  const ps = await box(mp, '#stats'), py = await box(mp, '#sys'), pb = await box(mp, '#bar'), pr = await box(mp, '#rotate-tip');
  ok(insideViewport(ps, 390, 844) && insideViewport(py, 390, 844) && insideViewport(pb, 390, 844), 'portrait 390x844 HUD fits inside viewport');
  ok(!overlaps(ps, py) && !overlaps(ps, pb) && !overlaps(py, pb), 'portrait 390x844 HUD elements do not overlap');
  ok(!!pr && insideViewport(pr, 390, 844) && !overlaps(pr, ps) && !overlaps(pr, py), 'nonintrusive rotate-to-landscape hint appears cleanly in portrait');
  await mp.screenshot({ path: path.join(out, '07_mobile_portrait.png') });

  const rd = await box(mp, '#rotate-dismiss');
  await mp.touchscreen.tap(rd.left + rd.width / 2, rd.top + rd.height / 2);
  ok((await box(mp, '#rotate-tip')) === null, 'rotate hint dismisses cleanly');

  // Rotate back to landscape & then tablet
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.waitForTimeout(200);
  const cSzL = await mp.evaluate(() => [document.getElementById('c').clientWidth, document.getElementById('c').clientHeight]);
  ok(cSzL[0] === 844 && cSzL[1] === 390, 'canvas resizes cleanly after portrait -> landscape rotation');

  await mp.setViewportSize({ width: 1024, height: 768 });
  await mp.waitForTimeout(200);
  const ts = await box(mp, '#stats'), ty = await box(mp, '#sys'), tb = await box(mp, '#bar');
  ok(insideViewport(ts, 1024, 768) && insideViewport(ty, 1024, 768) && insideViewport(tb, 1024, 768) && !overlaps(ts, ty), 'tablet 1024x768 layout scales cleanly without overlap');
  await mp.screenshot({ path: path.join(out, '08_tablet_1024x768.png') });

  ok(mErrs.length === 0, 'mobile/tablet playthrough had zero console errors' + (mErrs.length ? ': ' + mErrs.join('; ') : ''));
  await mCtx.close();

  // ==================== 11. DESKTOP (1280x720) ====================
  console.log('=== Desktop (1280x720) ===');
  const dCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: false });
  const dp = await dCtx.newPage();
  const dErrs = [];
  dp.on('console', m => { if (m.type() === 'error') dErrs.push(m.text()); });
  dp.on('pageerror', e => dErrs.push('PAGEERR ' + e.message));

  await dp.goto(url);
  await dp.waitForFunction(() => window.__game && !document.getElementById('begin').disabled, null, { timeout: 30000 });
  await dp.evaluate(() => { __game.newWorld(1234); __game.world.rainT = 1e9; __game.world.time = 0.42; });
  await dp.click('#begin');
  await dp.waitForTimeout(400);

  ok(await dp.evaluate(() => !document.getElementById('stats').classList.contains('collapsed')), 'desktop starts with stats expanded');
  ok((await box(dp, '#save')) !== null && (await box(dp, '#load')) !== null && (await box(dp, '#helpb')) !== null && (await box(dp, '#menub')) === null, 'desktop shows full top system buttons directly without menu toggle');

  await dp.keyboard.press('4');
  ok(await dp.evaluate(() => __game.tool === 'meteor'), 'keyboard shortcut 4 selects meteor on desktop');
  ok((await box(dp, '#row2')) !== null && (await box(dp, '#rng')) !== null, 'desktop shows inline hint and intensity slider');
  await dp.keyboard.press(']');
  ok(await dp.evaluate(() => document.getElementById('rv').textContent === '70%'), 'keyboard ] raises intensity on desktop');
  await dp.mouse.move(640, 360);
  await dp.mouse.click(640, 360);
  ok(await dp.evaluate(() => __game.world.meteors.length === 1), 'desktop mouse click drops meteor');
  const dc0 = await dp.evaluate(() => ({ gdist: __game.R.cam.gdist, gyaw: __game.R.cam.gyaw }));
  await dp.mouse.wheel(0, 400);
  await dp.mouse.move(640, 360);
  await dp.mouse.down({ button: 'right' });
  await dp.mouse.move(740, 380, { steps: 4 });
  await dp.mouse.up({ button: 'right' });
  const dc1 = await dp.evaluate(() => ({ gdist: __game.R.cam.gdist, gyaw: __game.R.cam.gyaw }));
  ok(dc1.gdist > dc0.gdist && Math.abs(dc1.gyaw - dc0.gyaw) > 0.2, 'desktop wheel zoom and right-drag rotate still work');
  await dp.screenshot({ path: path.join(out, '09_desktop_1280x720.png') });

  ok(dErrs.length === 0, 'desktop playthrough had zero console errors' + (dErrs.length ? ': ' + dErrs.join('; ') : ''));
  await dCtx.close();
  await browser.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
